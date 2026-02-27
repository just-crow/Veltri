"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface FileViewerProps {
    fileUrl: string;
    fileType: "PDF" | "DOCX";
}

export function FileViewer({ fileUrl, fileType }: FileViewerProps) {
    const [loading, setLoading] = useState(true);

    // For docs, we use Microsoft Office Viewer
    // For PDFs, we use the browser's native iframe viewer
    const viewerUrl =
        fileType === "DOCX"
            ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`
            : fileUrl;

    return (
        <div
            className="relative w-full rounded-xl border border-border shadow-sm overflow-hidden bg-background mb-8 group"
            style={{ height: "calc(100vh - 12rem)", minHeight: "600px" }}
        >
            {/* Loading State */}
            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10 transition-opacity duration-500">
                    <div className="relative flex items-center justify-center mb-4">
                        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                        <div className="p-3 bg-card border shadow-sm rounded-2xl relative">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground animate-pulse">
                        Rendering {fileType} Document...
                    </p>
                </div>
            )}

            <iframe
                src={viewerUrl}
                className={`absolute inset-0 w-full h-full border-0 transition-opacity duration-700 ${loading ? "opacity-0" : "opacity-100"}`}
                title={`${fileType} Document Viewer`}
                onLoad={() => setLoading(false)}
                allowFullScreen
            />
        </div>
    );
}
