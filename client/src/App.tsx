import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { FileText, History } from "lucide-react";
import DocumentProcessor from "@/pages/document-processor";
import DocumentHistory from "@/pages/document-history";
import NotFound from "@/pages/not-found";

function Navigation() {
  const [location] = useLocation();
  
  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-bold">Document Processor</h1>
          <div className="flex gap-2">
            <Link href="/">
              <Button 
                variant={location === "/" ? "default" : "outline"}
                size="sm"
                className="flex-1 sm:flex-none"
              >
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Process Document</span>
                <span className="sm:hidden">Process</span>
              </Button>
            </Link>
            <Link href="/history">
              <Button 
                variant={location === "/history" ? "default" : "outline"}
                size="sm"
                className="flex-1 sm:flex-none"
              >
                <History className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">History</span>
                <span className="sm:hidden">History</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <Switch>
          <Route path="/" component={DocumentProcessor} />
          <Route path="/history" component={DocumentHistory} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
