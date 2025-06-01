import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
      {/* Markdown Source */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center">
            <Code className="text-slate-500 mr-2 h-4 w-4" />
            Markdown Source
          </h3>
        </div>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-96 font-mono text-sm resize-none"
          placeholder="Processed markdown will appear here..."
        />
      </div>

      {/* Markdown Preview */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center">
            <Eye className="text-slate-500 mr-2 h-4 w-4" />
            Preview
          </h3>
        </div>
        <div className="min-h-96 overflow-y-auto p-4 bg-gray-50 rounded-lg prose prose-slate max-w-none text-sm">
          {value ? (
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mb-4 text-slate-800">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mb-3 text-slate-800">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mb-2 text-slate-800">{children}</h3>,
                p: ({ children }) => <p className="mb-3 text-slate-600 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="mb-3 pl-4 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 pl-4 space-y-1 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="text-slate-600">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
                em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
                code: ({ children }) => (
                  <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono text-slate-800">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="bg-gray-200 p-3 rounded-lg overflow-x-auto mb-3">
                    <code className="text-xs font-mono text-slate-800">{children}</code>
                  </pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-300 pl-4 italic text-slate-600 mb-3">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-4 border-gray-300" />,
              }}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <div className="text-slate-400 italic">Preview will appear here...</div>
          )}
        </div>
      </div>
    </div>
  );
}
