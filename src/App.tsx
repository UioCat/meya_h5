import { Camera, Images, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import ConfigPanel from './components/ConfigPanel';
import LivePusher from './components/LivePusher';

function App() {
  const [activeTab, setActiveTab] = useState<'capture' | 'config'>('capture');
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

  const handleOpenGallery = () => {
    showToast('目前当前还未支持');
  };

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(180deg,#e8f1f8_0%,#f7f9fc_18%,#f6efe5_100%)]">
      <div className="min-h-screen w-full bg-transparent">
        <div className="min-h-screen w-full">
          <div className={activeTab === 'capture' ? 'block' : 'hidden'}>
            <LivePusher />
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

      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto w-full max-w-[360px] px-4 pb-[max(10px,env(safe-area-inset-bottom))] lg:max-w-[420px] lg:px-0 lg:pb-6">
          <div className="rounded-[24px] border border-white/60 bg-white/18 shadow-[0_10px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl">
            <div className="flex justify-center pt-1.5">
              <div className="h-1 w-10 rounded-full bg-white/80" />
            </div>
            <div className="grid grid-cols-3 px-2 pb-1.5 pt-1">
              <button
                onClick={() => setActiveTab('capture')}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] transition ${
                  activeTab === 'capture' ? 'text-slate-950' : 'text-slate-600'
                }`}
              >
                <Camera className={`h-4.5 w-4.5 ${activeTab === 'capture' ? 'text-violet-700' : 'text-slate-500'}`} />
                <span className="font-medium leading-none">拍摄</span>
              </button>
              <button
                onClick={handleOpenGallery}
                className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] text-slate-600 transition"
              >
                <Images className="h-4.5 w-4.5 text-slate-500" />
                <span className="font-medium leading-none">照片库</span>
              </button>
              <button
                onClick={() => setActiveTab('config')}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] transition ${
                  activeTab === 'config' ? 'text-slate-950' : 'text-slate-600'
                }`}
              >
                <Settings className={`h-4.5 w-4.5 ${activeTab === 'config' ? 'text-violet-700' : 'text-slate-500'}`} />
                <span className="font-medium leading-none">配置</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
