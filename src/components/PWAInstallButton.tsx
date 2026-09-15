import React, { useState } from 'react';
import { Download, Laptop, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { DesktopInstallModal } from './DesktopInstallModal';

interface PWAInstallButtonProps {
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isInIframe, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  const handleClick = async () => {
    if (isInstalled) {
      setShowModal(true);
      return;
    }

    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'manual') {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  const handleTriggerInstall = async () => {
    const outcome = await install();
    if (outcome === 'accepted') {
      setShowModal(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        title={
          isInstalled
            ? 'Running as installed Desktop Application'
            : 'Install WebApp as a standalone Desktop Application'
        }
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm ${
          isInstalled
            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900/60'
            : 'bg-gradient-to-r from-cyan-600/90 to-blue-600/90 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/30 hover:shadow-cyan-500/20 hover:shadow-md'
        } ${className}`}
      >
        {isInstalled ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Desktop App Active</span>
            <span className="sm:hidden">Installed</span>
          </>
        ) : (
          <>
            <Laptop className="w-3.5 h-3.5 text-cyan-200 shrink-0" />
            <span>Install Desktop App</span>
            <span className="hidden md:inline-block px-1.5 py-0.2 text-[9px] rounded bg-white/20 text-white font-mono font-bold tracking-wider">
              PWA
            </span>
          </>
        )}
      </button>

      <DesktopInstallModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onTriggerInstall={handleTriggerInstall}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isInIframe={isInIframe}
      />
    </>
  );
};
