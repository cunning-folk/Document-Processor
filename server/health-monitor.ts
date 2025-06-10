import { storage } from './storage';
import { log } from './vite';

export class HealthMonitor {
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs = 30000; // 30 seconds

  start() {
    if (this.monitorInterval) return;
    
    log("Starting system health monitor", "health-monitor");
    this.monitorInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      log("Stopped system health monitor", "health-monitor");
    }
  }

  async performHealthCheck() {
    try {
      // Check for documents stuck in processing for too long
      const processingDocs = await storage.getDocumentsByStatus('processing');
      const stuckThreshold = 2 * 60 * 60 * 1000; // 2 hours
      const now = Date.now();
      
      for (const doc of processingDocs) {
        const timeSinceCreated = now - new Date(doc.createdAt).getTime();
        
        if (timeSinceCreated > stuckThreshold) {
          log(`Document ${doc.id} has been processing for ${Math.round(timeSinceCreated / 60000)} minutes - may need attention`, "health-monitor");
          
          // Auto-mark as failed if processing too long
          if (timeSinceCreated > 4 * 60 * 60 * 1000) { // 4 hours
            await storage.updateDocument(doc.id, {
              status: 'failed',
              errorMessage: 'Processing timed out - document may be too complex or large'
            });
            log(`Auto-failed document ${doc.id} after 4 hours of processing`, "health-monitor");
          }
        }
      }

      // Check system resource usage periodically
      const totalDocs = await storage.getAllDocuments();
      const activeProcessing = processingDocs.length;
      
      if (activeProcessing > 5) {
        log(`High processing load detected: ${activeProcessing} documents currently processing`, "health-monitor");
      }
      
      if (totalDocs.length > 1000) {
        log(`Large document database detected: ${totalDocs.length} total documents`, "health-monitor");
      }

    } catch (error: any) {
      log(`Health check error: ${error.message}`, "health-monitor");
    }
  }

  async getSystemStats() {
    try {
      const allDocs = await storage.getAllDocuments();
      const processingDocs = await storage.getDocumentsByStatus('processing');
      const completedDocs = await storage.getDocumentsByStatus('completed');
      const failedDocs = await storage.getDocumentsByStatus('failed');

      return {
        total: allDocs.length,
        processing: processingDocs.length,
        completed: completedDocs.length,
        failed: failedDocs.length,
        successRate: allDocs.length > 0 ? Math.round((completedDocs.length / allDocs.length) * 100) : 0
      };
    } catch (error: any) {
      log(`Error getting system stats: ${error.message}`, "health-monitor");
      return null;
    }
  }
}

export const healthMonitor = new HealthMonitor();