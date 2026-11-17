// AetherOS - Code Studio Visual Git Diff Viewer
import React from 'react';
import type { FileDiffResult } from '../../git/GitDiff';
import { GitCommit, X, Plus, Minus } from 'lucide-react';

export interface StudioDiffViewerProps {
  diff: FileDiffResult;
  onClose: () => void;
}

export const StudioDiffViewer: React.FC<StudioDiffViewerProps> = ({ diff, onClose }) => {
  return (
    <div className="flex flex-col h-full w-full bg-canvas text-ink font-mono text-xs select-text overflow-hidden">
      {/* Diff Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-side border-b border-line select-none">
        <div className="flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-accent" />
          <span className="font-semibold text-ink">{diff.filepath}</span>
          <span className="flex items-center gap-1 text-[11px] text-positive bg-positive/40 px-1.5 py-0.5 rounded border border-positive/40">
            <Plus className="w-3 h-3" />
            <span>{diff.additions}</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] text-danger bg-danger/40 px-1.5 py-0.5 rounded border border-danger/40">
            <Minus className="w-3 h-3" />
            <span>{diff.deletions}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-hover rounded text-muted hover:text-ink"
          title="Close Diff"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {diff.lines.length > 4000 && <div className="px-3 py-1 text-muted">Showing the first 4,000 diff lines. Use git diff for the full patch.</div>}
      {/* Diff Content Area */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {diff.lines.length === 0 ? (
          <div className="text-muted italic p-4 text-center">{diff.patch || 'No changes in this file.'}</div>
        ) : (
          diff.lines.slice(0, 4000).map((line, idx) => {
            let rowBg = '';
            let prefix = ' ';
            let textClass = 'text-secondary';

            if (line.type === 'add') {
              rowBg = 'bg-positive/40 border-l-2 border-emerald-500 text-positive';
              prefix = '+';
              textClass = 'text-positive';
            } else if (line.type === 'delete') {
              rowBg = 'bg-danger/40 border-l-2 border-rose-500 text-danger';
              prefix = '-';
              textClass = 'text-danger';
            }

            return (
              <div
                key={idx}
                className={`flex items-center leading-5 hover:bg-hover ${rowBg}`}
              >
                {/* Old line number */}
                <div className="w-10 text-right pr-2 text-muted select-none">
                  {line.oldLineNumber || ''}
                </div>
                {/* New line number */}
                <div className="w-10 text-right pr-2 text-muted select-none">
                  {line.newLineNumber || ''}
                </div>
                {/* Prefix symbol (+, -, space) */}
                <div className="w-4 text-center font-bold select-none text-muted">
                  {prefix}
                </div>
                {/* Content */}
                <div className={`flex-1 whitespace-pre pl-1 ${textClass}`}>
                  {line.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
