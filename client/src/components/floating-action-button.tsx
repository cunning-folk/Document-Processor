import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Upload, History, Sparkles } from "lucide-react";
import { Link } from "wouter";

export function FloatingActionButton() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Expanded menu */}
      {isExpanded && (
        <div className="absolute bottom-16 right-0 flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <Link href="/">
            <Button
              size="sm"
              variant="outline"
              className="h-12 px-4 bg-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 animate-in slide-in-from-right-2 duration-300 delay-100"
              onClick={() => setIsExpanded(false)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </Link>
          
          <Link href="/history">
            <Button
              size="sm"
              variant="outline"
              className="h-12 px-4 bg-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 animate-in slide-in-from-right-2 duration-300 delay-200"
              onClick={() => setIsExpanded(false)}
            >
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
          </Link>
        </div>
      )}

      {/* Main FAB */}
      <Button
        size="lg"
        className={`h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 border-0 animate-float aspect-square flex items-center justify-center p-0 ${
          isExpanded ? 'rotate-45 scale-110' : 'hover:scale-110'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <Plus className="h-6 w-6 transition-transform duration-300" />
        ) : (
          <Sparkles className="h-6 w-6 animate-pulse" />
        )}
      </Button>
    </div>
  );
}