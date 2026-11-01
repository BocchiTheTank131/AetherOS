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
    <div className="flex flex-col h-full w-full bg-[#0d1117] text-gray-200 font-mono text-xs select-text overflow-hidden">
      {/* Diff Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 select-none">
        <div className="flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white">{diff.filepath}</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40">
            <Plus className="w-3 h-3" />
            <span>{diff.additions}</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] text-rose-400 bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-800/40">
            <Minus className="w-3 h-3" />
            <span>{diff.deletions}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
          title="Close Diff"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Diff Content Area */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {diff.lines.length === 0 ? (
          <div className="text-gray-500 italic p-4 text-center">No changes in this file.</div>
        ) : (
          diff.lines.map((line, idx) => {
            let rowBg = '';
            let prefix = ' ';
            let textClass = 'text-gray-300';

            if (line.type === 'add') {
              rowBg = 'bg-emerald-950/40 border-l-2 border-emerald-500 text-emerald-200';
              prefix = '+';
              textClass = 'text-emerald-200';
            } else if (line.type === 'delete') {
              rowBg = 'bg-rose-950/40 border-l-2 border-rose-500 text-rose-200';
              prefix = '-';
              textClass = 'text-rose-200';
            }

            return (
              <div
                key={idx}
                className={`flex items-center leading-5 hover:bg-gray-800/50 ${rowBg}`}
              >
                {/* Old line number */}
                <div className="w-10 text-right pr-2 text-gray-600 select-none">
                  {line.oldLineNumber || ''}
                </div>
                {/* New line number */}
                <div className="w-10 text-right pr-2 text-gray-600 select-none">
                  {line.newLineNumber || ''}
                </div>
                {/* Prefix symbol (+, -, space) */}
                <div className="w-4 text-center font-bold select-none text-gray-500">
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
