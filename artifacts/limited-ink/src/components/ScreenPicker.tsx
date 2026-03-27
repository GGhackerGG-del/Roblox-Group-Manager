import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, X, Loader2 } from "lucide-react";

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface ScreenPickerProps {
  open: boolean;
  onSelect: (sourceId: string) => void;
  onClose: () => void;
}

export default function ScreenPicker({ open, onSelect, onClose }: ScreenPickerProps) {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    const ea = (window as any).electronAPI;
    if (ea?.getDesktopSources) {
      ea.getDesktopSources().then((s: DesktopSource[]) => {
        setSources(s || []);
        setLoading(false);
      }).catch(() => {
        setSources([]);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-[640px] max-w-[90vw] max-h-[80vh] bg-[#1e1f22] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <Monitor className="w-5 h-5 text-[#5B88BD]" />
                <span className="text-white font-semibold text-sm">Share Your Screen</span>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                </div>
              ) : sources.length === 0 ? (
                <div className="text-center py-12 text-white/40 text-sm">No screens or windows found</div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {sources.map(source => (
                    <button
                      key={source.id}
                      onClick={() => setSelected(source.id)}
                      onDoubleClick={() => onSelect(source.id)}
                      className={`group rounded-lg overflow-hidden border-2 transition-all duration-150 ${
                        selected === source.id
                          ? "border-[#5B88BD] bg-[#5B88BD]/10"
                          : "border-transparent hover:border-white/20 bg-[#2b2d31]"
                      }`}
                    >
                      <div className="aspect-video bg-black/40 overflow-hidden">
                        <img src={source.thumbnail} alt={source.name} className="w-full h-full object-contain" />
                      </div>
                      <div className="px-2 py-1.5">
                        <span className="text-[11px] text-white/70 truncate block text-center">{source.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg text-sm text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => selected && onSelect(selected)}
                disabled={!selected}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selected
                    ? "bg-[#5B88BD] text-white hover:bg-[#4a77ac]"
                    : "bg-[#5B88BD]/30 text-white/30 cursor-not-allowed"
                }`}
              >
                Share
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
