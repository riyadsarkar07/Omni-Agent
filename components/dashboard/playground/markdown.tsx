'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const KEYWORDS =
  /^(and|as|async|await|break|case|catch|class|const|continue|def|elif|else|enum|export|extends|false|finally|for|from|function|if|import|in|interface|let|new|null|or|return|switch|this|throw|true|try|type|typeof|undefined|var|void|while|with|yield)$/;

function highlightLine(line: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\/.*$|#.*$)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][\w]*\b)|([(){}\[\].,:;=+\-*/<>!&|%]+)/g;
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      parts.push(<span key={`${keyPrefix}-t${i++}`}>{line.slice(last, match.index)}</span>);
    }
    if (match[1]) {
      parts.push(
        <span key={`${keyPrefix}-s${i++}`} className="text-emerald-300/90">
          {match[1]}
        </span>
      );
    } else if (match[2]) {
      parts.push(
        <span key={`${keyPrefix}-c${i++}`} className="text-zinc-500 italic">
          {match[2]}
        </span>
      );
    } else if (match[3]) {
      parts.push(
        <span key={`${keyPrefix}-n${i++}`} className="text-amber-300/90">
          {match[3]}
        </span>
      );
    } else if (match[4]) {
      const word = match[4];
      parts.push(
        <span
          key={`${keyPrefix}-w${i++}`}
          className={KEYWORDS.test(word) ? 'text-cyan-300/90' : 'text-zinc-200'}
        >
          {word}
        </span>
      );
    } else {
      parts.push(
        <span key={`${keyPrefix}-p${i++}`} className="text-violet-300/80">
          {match[5]}
        </span>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < line.length) {
    parts.push(<span key={`${keyPrefix}-e`}>{line.slice(last)}</span>);
  }
  return parts;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const lang = (language || '').trim();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard may be blocked
    }
  };

  return (
    <div className="group/code relative my-2 max-w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 text-[12px] leading-relaxed">
        <code className="font-mono text-zinc-200">
          {code.split('\n').map((line, idx) => (
            <div key={idx} className="min-w-0 whitespace-pre">
              {highlightLine(line, `${idx}`)}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={`${keyBase}-p${i++}`}>{text.slice(last, match.index)}</span>);
    }
    if (match[1]) {
      nodes.push(
        <a
          key={`${keyBase}-a${i++}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-200"
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(
        <code
          key={`${keyBase}-c${i++}`}
          className="rounded-md border border-white/10 bg-zinc-950/80 px-1 py-0.5 font-mono text-[11px] text-cyan-200"
        >
          {match[4].slice(1, -1)}
        </code>
      );
    } else if (match[5]) {
      nodes.push(
        <strong key={`${keyBase}-b${i++}`} className="font-semibold text-zinc-50">
          {match[5].slice(2, -2)}
        </strong>
      );
    } else if (match[6]) {
      nodes.push(
        <em key={`${keyBase}-i${i++}`} className="italic text-zinc-200">
          {match[6].slice(1, -1)}
        </em>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyBase}-e`}>{text.slice(last)}</span>);
  }
  return nodes;
}

function parseTable(lines: string[]): string[][] | null {
  if (lines.length < 2) return null;
  const split = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const header = split(lines[0]);
  const divider = split(lines[1]);
  if (!header.length || divider.length < header.length) return null;
  if (!divider.every((c) => /^:?-{3,}:?$/.test(c))) return null;
  const rows = [header];
  for (let i = 2; i < lines.length; i++) {
    rows.push(split(lines[i]));
  }
  return rows;
}

export const MarkdownMessage: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let b = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(<CodeBlock key={`code-${b++}`} code={body.join('\n')} language={lang} />);
      continue;
    }

    if (/^\s*\|.+\|\s*$/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const table = parseTable(tableLines);
      if (table) {
        blocks.push(
          <div key={`tbl-${b++}`} className="my-2 max-w-full overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-[12px]">
              <thead className="bg-white/5 text-zinc-300">
                <tr>
                  {table[0].map((cell, idx) => (
                    <th key={idx} className="px-3 py-2 font-semibold">
                      {renderInline(cell, `th-${b}-${idx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.slice(1).map((row, rIdx) => (
                  <tr key={rIdx} className="border-t border-white/5">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-zinc-300">
                        {renderInline(cell, `td-${b}-${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
      for (const raw of tableLines) {
        blocks.push(
          <p key={`p-${b++}`} className="my-1 text-[13px] leading-relaxed text-zinc-100">
            {renderInline(raw, `p-${b}`)}
          </p>
        );
      }
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1
          ? 'mt-3 mb-1 text-base font-semibold text-zinc-50'
          : level === 2
            ? 'mt-3 mb-1 text-sm font-semibold text-zinc-50'
            : 'mt-2 mb-1 text-[13px] font-semibold text-zinc-100';
      blocks.push(
        <div key={`h-${b++}`} className={cls}>
          {renderInline(heading[2], `h-${b}`)}
        </div>
      );
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items: { ordered: boolean; text: string }[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+\.\s+/.test(lines[i]) : /^\s*[-*]\s+/.test(lines[i]))
      ) {
        items.push({
          ordered,
          text: lines[i].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ''),
        });
        i += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={`l-${b++}`}
          className={`my-2 space-y-1 pl-5 text-[13px] leading-relaxed text-zinc-100 ${
            ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item.text, `li-${b}-${idx}`)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`q-${b++}`}
          className="my-2 border-l-2 border-cyan-500/40 pl-3 text-[13px] italic text-zinc-300"
        >
          {quote.map((q, idx) => (
            <p key={idx}>{renderInline(q, `q-${b}-${idx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*\|.+\|\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p-${b++}`} className="my-1 text-[13px] leading-relaxed text-zinc-100">
        {renderInline(para.join(' '), `p-${b}`)}
      </p>
    );
  }

  return <div className="oa-md max-w-full min-w-0">{blocks}</div>;
};
