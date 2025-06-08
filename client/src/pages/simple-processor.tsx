import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function SimpleProcessor() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const { toast } = useToast();

  const processMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch("/api/process-document-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: content,
          filename: "direct-input.txt",
          assistantId: "asst_OqSPqevzweqfm85VGKcJuNPF"
        })
      });
      
      if (!response.ok) {
        throw new Error("Processing failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setResult(data.processedMarkdown);
      toast({
        title: "Processing Complete",
        description: "Your text has been formatted successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleProcess = () => {
    if (!text.trim()) {
      toast({
        title: "No Text",
        description: "Please enter some text to process.",
        variant: "destructive"
      });
      return;
    }
    processMutation.mutate(text);
  };

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8 max-w-4xl">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-3">
          Document Text Processor
        </h1>
        <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
          Process your document text with AI formatting. For PDFs, extract text first using the Python script.
        </p>
      </div>

      {/* PDF Extraction Instructions */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <h3 className="text-sm font-medium text-blue-900 mb-2">For PDF Files:</h3>
          <div className="text-xs text-blue-800 space-y-2">
            <p>Extract text locally first:</p>
            <div className="bg-blue-100 p-2 rounded font-mono text-xs">
              python extract-pdf-text.py your-document.pdf
            </div>
            <p>Then copy the text from the generated _extracted.txt file and paste below.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/extract-pdf-text.py', '_blank')}
            className="mt-3 text-blue-700 border-blue-300 hover:bg-blue-100"
          >
            <Download className="mr-2 h-3 w-3" />
            Download PDF Extractor
          </Button>
        </CardContent>
      </Card>

      {/* Text Input */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <FileText className="text-primary mr-2 h-5 w-5" />
            Text Input
          </h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your document text here..."
            className="w-full h-48 p-4 border border-gray-300 rounded-lg resize-vertical font-mono text-sm"
            disabled={processMutation.isPending}
          />
          <div className="flex justify-between items-center mt-4">
            <span className="text-sm text-gray-500">
              {text.length} characters
            </span>
            <Button
              onClick={handleProcess}
              disabled={!text.trim() || processMutation.isPending}
              className="min-w-32"
            >
              {processMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Process Text"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Formatted Result
            </h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
                {result}
              </pre>
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigator.clipboard.writeText(result)}
            >
              Copy to Clipboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}