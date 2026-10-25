import { useEffect, useState, useCallback } from 'react';
import { studioApi } from '../api/studioApi';
import { useEscapeClose } from '../lib/utils';

export interface QcReportData {
  exists: boolean;
  report: Record<string, unknown> | null;
  markdown: string;
}

export function useQcReportViewModel(
  filePath: string | null,
  isOpen: boolean,
  onClose: () => void,
) {
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [reportData, setReportData] = useState<QcReportData | null>(null);

  useEffect(() => {
    if (!isOpen || !filePath) {
      return;
    }

    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) setLoading(true);
    });

    studioApi
      .getQcReport(filePath)
      .then((data) => {
        if (isMounted) {
          setReportData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setReportData(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, filePath]);

  useEscapeClose(isOpen, onClose);

  const activeReportData = isOpen && filePath ? reportData : null;

  const handleCopy = useCallback(() => {
    if (activeReportData?.markdown) {
      navigator.clipboard.writeText(activeReportData.markdown).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [activeReportData]);

  const handleDownload = useCallback(() => {
    if (activeReportData?.report) {
      const blob = new Blob([JSON.stringify(activeReportData.report, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filePath ? filePath.split(/[/\\]/).pop() : 'qc'}_report.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [activeReportData, filePath]);

  return {
    loading,
    copied,
    reportData: activeReportData,
    handleCopy,
    handleDownload,
  };
}
