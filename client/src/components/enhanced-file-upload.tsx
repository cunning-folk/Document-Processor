import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface FileValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedTextLength?: number;
  estimatedProcessingTime?: number;
}

interface EnhancedFileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
  validation?: FileValidation | null;
  isValidating?: boolean;
}

export function EnhancedFileUpload({ 
  onFileSelect, 
  selectedFile, 
  disabled, 
  validation,
  isValidating 
}: EnhancedFileUploadProps) {
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    disabled
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeIcon = (file: File) => {
    const extension = file.name.toLowerCase().split('.').pop();
    return <FileText className="h-5 w-5" />;
  };

  const clearFile = () => {
    onFileSelect(null);
  };

  return (
    <div className="w-full space-y-4">
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            {isDragActive ? 'Drop your file here' : 'Drop files or click to upload'}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Supports PDF, TXT, and Markdown files up to 50MB
          </p>
          <Button variant="outline" disabled={disabled}>
            Select File
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                {getFileTypeIcon(selectedFile)}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">
                    {selectedFile.name}
                  </h4>
                  <p className="text-sm text-gray-500 font-mono">
                    {formatFileSize(selectedFile.size)}
                  </p>
                  
                  {isValidating && (
                    <div className="mt-2">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        Validating...
                      </Badge>
                    </div>
                  )}
                  
                  {validation && (
                    <div className="mt-2 space-y-2">
                      {validation.isValid ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm">File validation passed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm">Validation issues found</span>
                        </div>
                      )}
                      
                      {validation.warnings.length > 0 && (
                        <div className="text-sm text-orange-600">
                          <strong>Warnings:</strong>
                          <ul className="list-disc list-inside ml-2">
                            {validation.warnings.map((warning, index) => (
                              <li key={index}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {validation.errors.length > 0 && (
                        <div className="text-sm text-red-600">
                          <strong>Errors:</strong>
                          <ul className="list-disc list-inside ml-2">
                            {validation.errors.map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {validation.estimatedTextLength && (
                        <div className="text-sm text-gray-600">
                          <strong>Estimated content:</strong> {Math.round(validation.estimatedTextLength / 1000)}K characters
                        </div>
                      )}
                      
                      {validation.estimatedProcessingTime && (
                        <div className="text-sm text-gray-600">
                          <strong>Estimated processing time:</strong> ~{Math.ceil(validation.estimatedProcessingTime / 60)} minutes
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFile}
                disabled={disabled}
                className="ml-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}