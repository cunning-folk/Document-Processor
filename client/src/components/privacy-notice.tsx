import { Shield, Eye, Lock, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PrivacyNotice() {
  return (
    <Card className="mb-6 border-green-200 bg-green-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center text-green-800">
          <Shield className="h-5 w-5 mr-2" />
          Privacy Protected
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start space-x-2">
            <Lock className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <Badge variant="outline" className="mb-1 text-xs">Encrypted</Badge>
              <p className="text-green-700">Your content is encrypted before upload</p>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <Eye className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <Badge variant="outline" className="mb-1 text-xs">Private</Badge>
              <p className="text-green-700">Content is never readable by the server admin</p>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <Trash2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <Badge variant="outline" className="mb-1 text-xs">Auto-Delete</Badge>
              <p className="text-green-700">Documents automatically deleted after 24 hours</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}