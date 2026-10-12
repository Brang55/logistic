import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

import { labelTableCells } from "./labelTableCells";
import styles from "./ReplyText.module.css";

/** An assistant reply: a short answer, then headings, lists or tables (markdown). */
const ReplyText = ({ text, onNavigate }: { text: string; onNavigate?: (path: string) => void }) => {
  // Raw HTML in a reply is never rendered; links inside the app stay in the app.
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) =>
        href?.startsWith("/") ? (
          <Link to={href} onClick={() => onNavigate?.(href)}>
            {children}
          </Link>
        ) : (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
      // Wide tables scroll sideways instead of stretching the panel; on phones rows become cards.
      table: ({ children }) => (
        <div className={styles.tableWrap}>
          <table>{children}</table>
        </div>
      ),
    }),
    [onNavigate]
  );

  return (
    <div className={styles.reply}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[labelTableCells]} components={components}>
        {text}
      </Markdown>
    </div>
  );
};

export default ReplyText;
