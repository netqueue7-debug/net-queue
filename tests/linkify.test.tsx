import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { linkifyText } from "@/components/ui/linkify";

// No DOM/rendering environment in this project (vitest runs in "node") —
// linkifyText returns plain data (strings and React elements) before any
// rendering happens, so these walk that structure directly rather than
// pulling in jsdom + @testing-library/react for one component.

function stringify(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(stringify).join("");
  if (isValidElement(node)) return stringify((node.props as { children?: ReactNode }).children);
  return "";
}

function textOf(nodes: ReactNode[]): string {
  return stringify(nodes);
}

function findAnchors(nodes: ReactNode[]): ReactElement<{ href: string; target?: string; rel?: string }>[] {
  const anchors: ReactElement<{ href: string; target?: string; rel?: string }>[] = [];
  function walk(node: ReactNode) {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (isValidElement(node)) {
      if (node.type === "a") anchors.push(node as ReactElement<{ href: string; target?: string; rel?: string }>);
      walk((node.props as { children?: ReactNode }).children);
    }
  }
  nodes.forEach(walk);
  return anchors;
}

describe("linkifyText", () => {
  it("returns plain text unchanged with no links when there are no URLs", () => {
    const result = linkifyText("Just some plain text, nothing to see here.");
    expect(findAnchors(result)).toHaveLength(0);
    expect(textOf(result)).toBe("Just some plain text, nothing to see here.");
  });

  it("turns a bare URL into a link with the right href, target, and rel", () => {
    const result = linkifyText("Check out https://example.com for details.");
    const anchors = findAnchors(result);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].props.href).toBe("https://example.com");
    expect(anchors[0].props.target).toBe("_blank");
    expect(anchors[0].props.rel).toBe("noreferrer");
    expect(textOf(result)).toBe("Check out https://example.com for details.");
  });

  it("strips trailing sentence punctuation from the href but keeps it in the visible text", () => {
    const result = linkifyText("See https://example.com/path.");
    expect(findAnchors(result)[0].props.href).toBe("https://example.com/path");
    expect(textOf(result)).toBe("See https://example.com/path.");
  });

  it("handles a URL wrapped in parentheses", () => {
    const result = linkifyText("(see https://example.com/x)");
    expect(findAnchors(result)[0].props.href).toBe("https://example.com/x");
    expect(textOf(result)).toBe("(see https://example.com/x)");
  });

  it("linkifies multiple URLs independently", () => {
    const result = linkifyText("First https://a.com then https://b.com done.");
    expect(findAnchors(result).map((a) => a.props.href)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("does not linkify a bare domain with no protocol", () => {
    const result = linkifyText("Visit example.com sometime.");
    expect(findAnchors(result)).toHaveLength(0);
  });
});
