import { Shield, Eye, Lock, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PrivacyNotice() {
  return (
    <Card className="mb-6 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 animate-in slide-in-from-top-2 duration-700 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center text-green-800 animate-in slide-in-from-left-2 duration-500">
          <Shield className="h-5 w-5 mr-2 animate-pulse" />
          Privacy Protected
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start space-x-2 animate-in slide-in-from-bottom-2 duration-500 delay-100">
            <Lock className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0 transition-transform duration-300 hover:scale-110" />
            <div>
              <Badge variant="outline" className="mb-1 text-xs bg-green-100 border-green-300 animate-in zoom-in-75 duration-300 delay-200">Encrypted</Badge>
              <p className="text-green-700">Your content is encrypted before upload</p>
            </div>
          </div>
          <div className="flex items-start space-x-2 animate-in slide-in-from-bottom-2 duration-500 delay-200">
            <Eye className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0 transition-transform duration-300 hover:scale-110" />
            <div>
              <Badge variant="outline" className="mb-1 text-xs bg-blue-100 border-blue-300 animate-in zoom-in-75 duration-300 delay-300">Private</Badge>
              <p className="text-green-700">Content is never readable by the server admin</p>
            </div>
          </div>
          <div className="flex items-start space-x-2 animate-in slide-in-from-bottom-2 duration-500 delay-300">
            <Trash2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0 transition-transform duration-300 hover:scale-110" />
            <div>
              <Badge variant="outline" className="mb-1 text-xs bg-orange-100 border-orange-300 animate-in zoom-in-75 duration-300 delay-400">Auto-Delete</Badge>
              <p className="text-green-700">Documents automatically deleted after 24 hours</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}