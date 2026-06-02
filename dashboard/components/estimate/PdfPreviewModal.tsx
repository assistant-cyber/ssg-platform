'use client';
import dynamic from 'next/dynamic';
import { X, Download } from 'lucide-react';
import type { EstimateState } from './types';

// React PDF must be loaded client-side only
const PDFViewer   = dynamic(() => import('@react-pdf/renderer').then(m => m.PDFViewer),   { ssr: false });
const PDFDownloadLink = dynamic(() => import('@react-pdf/renderer').then(m => m.PDFDownloadLink), { ssr: false });
const EstimatePdf = dynamic(() => import('./EstimatePdf'), { ssr: false });

interface Props {
  open: boolean;
  onClose: () => void;
  projectName: string;
  churchName: string;
  address: string;
  date: string;
  estimate: EstimateState;
  filename: string;
}

export default function PdfPreviewModal({
  open, onClose, projectName, churchName, address, date, estimate, filename,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 bg-ssg-dark text-white shrink-0">
          <div>
            <h3 className="font-bold text-lg" style={{ fontFamily: 'Georgia, serif' }}>
              Estimate Preview
            </h3>
            <p className="text-white/60 text-sm">{churchName || projectName}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Download button */}
            <PDFDownloadLink
              document={
                <EstimatePdf
                  projectName={projectName}
                  churchName={churchName}
                  address={address}
                  date={date}
                  estimate={estimate}
                />
              }
              fileName={filename}
            >
              {({ loading }) => (
                <button
                  className="flex items-center gap-2 bg-ssg-green hover:bg-ssg-dark px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  <Download size={15} />
                  {loading ? 'Preparing…' : 'Download PDF'}
                </button>
              )}
            </PDFDownloadLink>
            <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* PDF viewer */}
        <div className="flex-1 min-h-0">
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <EstimatePdf
              projectName={projectName}
              churchName={churchName}
              address={address}
              date={date}
              estimate={estimate}
            />
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}
