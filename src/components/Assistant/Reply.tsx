import { lazy, Suspense } from "react";

// The markdown renderer is only needed once the assistant answers, so it loads on demand.
const ReplyText = lazy(() => import("./ReplyText"));

/** An assistant reply, rendered as markdown; plain text until the renderer has loaded. */
const Reply = ({ text, onNavigate }: { text: string; onNavigate?: (path: string) => void }) => (
  <Suspense fallback={<p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{text}</p>}>
    <ReplyText text={text} onNavigate={onNavigate} />
  </Suspense>
);

export default Reply;
