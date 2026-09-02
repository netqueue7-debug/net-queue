import { Card } from "./card";

export function WaiverPanel({ content }: { content: string | null }) {
  return (
    <Card>
      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-muted">{content}</pre>
    </Card>
  );
}
