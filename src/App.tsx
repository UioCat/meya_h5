import { Camera, Images, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import ConfigPanel from './components/ConfigPanel';
import LivePusher from './components/LivePusher';
import PhotoLibrary from './components/PhotoLibrary';

function App() {
  const [activeTab, setActiveTab] = useState<'capture' | 'gallery' | 'config'>('capture');
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (message: string) => {
    setToastMessage(message);
  };

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = window.setTimeout(() => {
      setToastMessage('');
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const navButtonClass = (active: boolean) =>
    `flex min-h-[58px] w-full flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-xs transition sm:min-h-[62px] ${
      active
        ? 'border-slate-950 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
        : 'border-slate-700 bg-slate-800 text-slate-300 shadow-[0_6px_18px_rgba(15,23,42,0.14)] hover:border-slate-600 hover:bg-slate-700'
    }`;

  return (
    <div className="min-h-screen w-full bg-slate-900">
      <div className="w-full bg-slate-900">
        <div className="w-full">
          <div className={activeTab === 'capture' ? 'block' : 'hidden'}>
            <LivePusher />
          </div>
          <div className={activeTab === 'gallery' ? 'block' : 'hidden'}>
            <PhotoLibrary notify={showToast} />
          </div>
          <div className={activeTab === 'config' ? 'block' : 'hidden'}>
            <ConfigPanel notify={showToast} />
          </div>
        </div>
      </div>

      <div
        className={`pointer-events-none fixed left-1/2 top-6 z-40 -translate-x-1/2 px-4 transition ${
          toastMessage ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'
        }`}
      >
        <div className="rounded-full bg-slate-900/88 px-4 py-2 text-sm text-white shadow-[0_16px_40px_rgba(15,23,42,0.28)] backdrop-blur">
          {toastMessage}
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-900 shadow-[0_-8px_32px_rgba(15,23,42,0.2)]">
        <div className="mx-auto w-full max-w-5xl px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 sm:px-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTab('capture')}
              className={navButtonClass(activeTab === 'capture')}
            >
              <Camera className={`h-[18px] w-[18px] ${activeTab === 'capture' ? 'text-sky-300' : 'text-slate-400'}`} />
              <span className="font-medium leading-none">拍摄</span>
            </button>
            <button
              onClick={() => setActiveTab('gallery')}
              className={navButtonClass(activeTab === 'gallery')}
            >
              <Images className={`h-[18px] w-[18px] ${activeTab === 'gallery' ? 'text-sky-300' : 'text-slate-400'}`} />
              <span className="font-medium leading-none">照片库</span>
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={navButtonClass(activeTab === 'config')}
            >
              <Settings className={`h-[18px] w-[18px] ${activeTab === 'config' ? 'text-sky-300' : 'text-slate-400'}`} />
              <span className="font-medium leading-none">配置</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
