import { useState } from 'react';
import LivePusher from './components/LivePusher';
import TemplateManager from './components/TemplateManager';

function App() {
  const [activeTab, setActiveTab] = useState<'video_analysis' | 'admin'>('video_analysis');

  return (
      <div className="min-h-screen bg-slate-900">
        <div className="sticky top-0 z-20 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
          <div className="max-w-4xl mx-auto px-6 py-3 flex gap-2">
            <button
                onClick={() => setActiveTab('video_analysis')}
                className={`px-4 py-2 rounded-lg text-sm ${
                    activeTab === 'video_analysis'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-200'
                }`}
            >
              视频分析
            </button>
            <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 rounded-lg text-sm ${
                    activeTab === 'admin'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-200'
                }`}
            >
              后台管理
            </button>
          </div>
        </div>

        <div className={activeTab === 'video_analysis' ? 'block' : 'hidden'}>
          <LivePusher />
        </div>
        <div className={activeTab === 'admin' ? 'block' : 'hidden'}>
          <TemplateManager />
        </div>
      </div>
  );
}

export default App;
