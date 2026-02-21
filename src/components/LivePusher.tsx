import { useState, useRef, useEffect } from 'react';
import { Video, VideoOff, Radio } from 'lucide-react';

declare global {
  interface Window {
    TXLivePusher: any;
  }
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

function LivePusher() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState('未连接');
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [wsStatus, setWsStatus] = useState('未连接');
  const [messages, setMessages] = useState<string[]>([]);
  const [activeMode, setActiveMode] = useState<'image_search' | 'alignment_person'>(
      'image_search'
  );
  const [personRatioPercent, setPersonRatioPercent] = useState(30);
  const [personCenterPosition, setPersonCenterPosition] = useState('眼睛');
  const [faceCenterOffsetDeg, setFaceCenterOffsetDeg] = useState(5);
  const [alignmentError, setAlignmentError] = useState('');
  const [moveGuide, setMoveGuide] = useState<{
    pitch?: number;
    roll?: number;
    circle?: number;
  } | null>(null);

  const pusherRef = useRef<any>(null);
  const deviceManagerRef = useRef<any>(null);
  // const localStreamRef = useRef<MediaStream | null>(null);

  const WS_SERVER = "wss://www.uiofield.top/meya/ws";
  const WEB_SERVER = "https://www.uiofield.top/meya/push"
  const PUSH_URL =
      'webrtc://226975.push.tlivecloud.com/live/stream?txSecret=693abaae6e8346597f7e6c9d30cab682&txTime=69CABA52';

  /** 浏览器兼容性检测 */
  // useEffect(() => {
  //   window.TXLivePusher.checkSupport().then((res: any) => {
  //     if (!res.isWebRTCSupported) {
  //       setError('当前浏览器不支持 WebRTC');
  //     }
  //   });
  useEffect(() => {
    const initDevices = async () => {
      try {
        // 1. 浏览器能力检测
        const res = await window.TXLivePusher.checkSupport();
        if (!res.isWebRTCSupported) {
          setError('当前浏览器不支持 WebRTC');
          return;
        }

        setStreamStatus('申请摄像头权限...');

        // 2. 主动申请权限（iOS 必须）
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        stream.getTracks().forEach(t => t.stop());

        // 3. 用「临时 pusher」只做设备枚举
        const tempPusher = new window.TXLivePusher();
        await enumerateDevices(tempPusher);

        setStreamStatus('未连接');
      } catch (e: any) {
        setError(e.message || '摄像头权限申请失败');
      }
    };

    initDevices();

    return () => {
      stopStream();
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_SERVER);
    wsRef.current = ws;
    ws.onopen = () => {
      setWsStatus('已连接');

      // ❤️ 心跳：每 5 秒一次
      heartbeatRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      }, 5000);
    };

    // ws.onmessage = event => {
    //   setMessages(prev => [
    //     typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
    //     ...prev
    //   ].slice(0, 10));
    // };
    ws.onmessage = event => {
      const normalizeMessage = (data: unknown) => {
        if (typeof data !== 'string') {
          return JSON.stringify(data);
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.type === 'move' && parsed.move) {
            setMoveGuide({
              pitch: parsed.move.pitch,
              roll: parsed.move.roll,
              circle: parsed.move.circle
            });
          }
          return JSON.stringify(parsed);
        } catch {
          return data.replace(/\\u([\dA-Fa-f]{4})/g, (_, code) =>
              String.fromCharCode(parseInt(code, 16))
          );
        }
      };

      const msg = normalizeMessage(event.data);
      setMessages(prev => [msg, ...prev].slice(0, 10));
    };

    ws.onerror = () => {
      setWsStatus('连接异常');
    };

    ws.onclose = () => {
      setWsStatus('已断开');
    };

    return () => {
      // 清理
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      ws.close();
    };
  }, []);

  const resetRenderView = () => {
    const container = document.getElementById('videoContainer');
    if (container) {
      container.innerHTML = ''; // ⭐ 关键：清空旧 video / canvas
    }
  };

  /**
   * 压缩图片（iOS 原图友好）
   * @param file 原始图片文件
   * @param maxSize 最大边长（默认 1280）
   * @param quality jpeg 质量（0~1，默认 0.7）
   */
  const compressImage = (
      file: File,
      maxSize = 1280,
      quality = 0.7
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const img = new Image();

        img.onload = () => {
          let { width, height } = img;

          // 等比缩放
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 不支持'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // ⭐ 强制转 jpeg（解决 iOS HEIC 问题）
          const compressedBase64 = canvas.toDataURL(
              'image/jpeg',
              quality
          );

          resolve(compressedBase64);
        };

        img.onerror = reject;
        img.src = reader.result as string;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUploadTemplate = () => {
    fileInputRef.current?.click();
  };

  const handleSubmitAlignmentPerson = async () => {
    setAlignmentError('');
    try {
      await fetch(WEB_SERVER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'alignment_person',
          person_ratio_percent: personRatioPercent,
          center_position: personCenterPosition,
          face_center_offset_deg: faceCenterOffsetDeg
        })
      });
    } catch (err) {
      console.error('提交对准-人失败', err);
      setAlignmentError('提交失败');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // ⭐ iOS 原图压缩
      const compressedBase64 = await compressImage(
          file,
          1280, // 最大边
          0.7   // 质量
      );

      await fetch(WEB_SERVER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'upload_template',
          filename: file.name.replace(/\.\w+$/, '.jpg'),
          contentType: 'image/jpeg',
          streamUrl: 'http://play.uiofield.top/live/stream.flv',
          data: compressedBase64
        })
      });
    } catch (err) {
      console.error('图片压缩或上传失败', err);
    }

    // 允许重复选择同一张
    e.target.value = '';
  };


  /** 获取设备列表 */
  const enumerateDevices = async (pusher: any) => {
    const deviceManager = pusher.getDeviceManager();
    deviceManagerRef.current = deviceManager;

    const list = await deviceManager.getDevicesList();
    const cameras = list
        .filter((d: any) => d.type === 'video')
        .map((d: any) => ({
          deviceId: d.deviceId,
          label: d.deviceName
        }));

    setDevices(cameras);

    // ⭐ 默认选第一个
    if (cameras.length) {
      setSelectedCamera(prev => prev || cameras[0].deviceId);
    }
  };

  /** 开始推流 */
  const startStream = async () => {
    try {
      setError('');
      setStreamStatus('初始化推流器...');

      // ⭐ 每次启动前，先清空渲染容器
      resetRenderView();

      const pusher = new window.TXLivePusher();
      pusherRef.current = pusher;

      pusher.setRenderView('videoContainer');
      pusher.videoView.muted = true;

      pusher.setVideoQuality('480p');
      pusher.setProperty('setVideoFPS', 25);

      pusher.setObserver({
        onPushStatusUpdate: (_: number, msg: string) => {
          setStreamStatus(msg || '推流中');
        }
      });

      await pusher.startCamera();

      if (selectedCamera) {
        await pusher.getDeviceManager().switchCamera(selectedCamera);
      }

      await pusher.startPush(PUSH_URL);

      setIsStreaming(true);
      setStreamStatus('直播中');
    } catch (e: any) {
      setError(e.message || '启动推流失败');
      setStreamStatus('未连接');
    }
  };

  /** 停止推流 */
  const stopStream = () => {
    if (!pusherRef.current) return;

    try {
      pusherRef.current.stopPush();
      pusherRef.current.stopCamera();
    } catch {}

    pusherRef.current = null;
    setIsStreaming(false);
    setStreamStatus('未连接');

    // ⭐ 防止残留 DOM
    resetRenderView();
  };

  /** 摄像头开关 */
  const toggleCamera = async () => {
    if (!pusherRef.current) return;

    if (isCameraOn) {
      await pusherRef.current.stopCamera();
    } else {
      await pusherRef.current.startCamera();
    }

    setIsCameraOn(!isCameraOn);
  };

  const isIOS = () => {
    return /iP(hone|od|ad)/.test(navigator.userAgent);
  };


  return (
      <div className="p-6 bg-slate-900 min-h-screen">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold text-white">腾讯云 Web 推流</h1>

          <div className="bg-black aspect-video rounded-xl relative overflow-hidden">
            <div id="videoContainer" className="w-full h-full" />
            {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <Video className="w-14 h-14" />
                </div>
            )}

            {moveGuide && (
                <div className="absolute inset-0 pointer-events-none text-white">
                  {moveGuide.pitch !== undefined && moveGuide.pitch !== 0 && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-4 flex flex-col items-center">
                        <div className="text-xs bg-black/60 px-2 py-1 rounded">
                          {moveGuide.pitch > 0 ? '向前' : '向后'}
                        </div>
                        <div
                            className={`w-0 h-0 border-l-[10px] border-r-[10px] border-l-transparent border-r-transparent ${
                                moveGuide.pitch > 0
                                    ? 'border-b-[18px] border-b-emerald-400 mt-2'
                                    : 'border-t-[18px] border-t-emerald-400 mt-2'
                            }`}
                        />
                      </div>
                  )}

                  {moveGuide.roll !== undefined && moveGuide.roll !== 0 && (
                      <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center">
                        {moveGuide.roll < 0 && (
                            <div
                                className="w-0 h-0 border-t-[10px] border-b-[10px] border-t-transparent border-b-transparent border-r-[18px] border-r-emerald-400 mr-2"
                            />
                        )}
                        <div className="text-xs bg-black/60 px-2 py-1 rounded">
                          {moveGuide.roll > 0 ? '向右' : '向左'}
                        </div>
                        {moveGuide.roll > 0 && (
                            <div
                                className="w-0 h-0 border-t-[10px] border-b-[10px] border-t-transparent border-b-transparent border-l-[18px] border-l-emerald-400 ml-2"
                            />
                        )}
                      </div>
                  )}

                  {moveGuide.circle !== undefined && moveGuide.circle !== 0 && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                        <div className="text-xs bg-black/60 px-2 py-1 rounded">
                          {moveGuide.circle > 0 ? '顺时针转' : '逆时针转'}
                        </div>
                        <div className="w-8 h-8 rounded-full border-2 border-emerald-400 relative">
                          <div
                              className={`absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent ${
                                  moveGuide.circle > 0
                                      ? 'border-b-[10px] border-b-emerald-400'
                                      : 'border-t-[10px] border-t-emerald-400'
                              }`}
                          />
                        </div>
                      </div>
                  )}
                </div>
            )}
          </div>

            <div className="flex items-center justify-between text-white">
            <span>{streamStatus}</span>

            <span
                className={`text-sm ${
                    wsStatus === '已连接' ? 'text-green-400' : 'text-yellow-400'
                }`}
            >
            WS：{wsStatus}
            </span>
            {isStreaming && (
                <span className="flex items-center text-red-500">
                    <Radio className="w-4 h-4 mr-1" /> 直播中
                  </span>
            )}
          </div>
          <div className="bg-slate-800 rounded-xl p-4 text-white">
            <div className="text-slate-300 mb-2">指令控制台</div>

            <div className="max-h-48 overflow-y-auto space-y-1 text-sm">
              {messages.length === 0 && (
                  <div className="text-slate-500">暂无消息</div>
              )}

              {messages.map((msg, idx) => (
                  <div
                      key={idx}
                      className="bg-slate-700 rounded px-2 py-1 break-all"
                  >
                    {msg}
                  </div>
              ))}
            </div>
          </div>

          <div className="flex space-x-3">
            <button
                onClick={isStreaming ? stopStream : startStream}
                className={`flex-1 py-3 rounded-xl ${
                    isStreaming ? 'bg-red-500' : 'bg-blue-500'
                }`}
            >
              {isStreaming ? '停止推流' : '开始推流'}
            </button>

            <button
                onClick={toggleCamera}
                disabled={!isStreaming}
                className="p-3 bg-slate-700 rounded-xl"
            >
              {isCameraOn ? <Video /> : <VideoOff />}
            </button>

          </div>

          <div className="bg-slate-800 rounded-xl p-4 text-white">
            <div className="text-slate-300 mb-3">模式</div>
            <div className="flex space-x-3">
              <button
                  onClick={() => setActiveMode('image_search')}
                  className={`px-4 py-2 rounded-xl ${
                      activeMode === 'image_search' ? 'bg-blue-500' : 'bg-slate-700'
                  }`}
              >
                以图搜景
              </button>
              <button
                  onClick={() => setActiveMode('alignment_person')}
                  className={`px-4 py-2 rounded-xl ${
                      activeMode === 'alignment_person'
                          ? 'bg-blue-500'
                          : 'bg-slate-700'
                  }`}
              >
                对准-人
              </button>
            </div>

            {activeMode === 'image_search' && (
                <div className="mt-4">
                  <button
                      onClick={handleUploadTemplate}
                      className="w-full py-2 rounded-xl bg-slate-700 text-white"
                  >
                    以图搜景
                  </button>
                </div>
            )}

            {activeMode === 'alignment_person' && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-slate-300 text-sm">人体占比百分比</label>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={personRatioPercent}
                        onChange={e => setPersonRatioPercent(Number(e.target.value))}
                        className="w-full mt-2 bg-slate-900 text-white p-2 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 text-sm">居中位置</label>
                    <select
                        value={personCenterPosition}
                        onChange={e => setPersonCenterPosition(e.target.value)}
                        className="w-full mt-2 bg-slate-900 text-white p-2 rounded"
                    >
                      <option value="眼睛">眼睛</option>
                      <option value="肩膀">肩膀</option>
                      <option value="髋部">髋部</option>
                      <option value="膝盖">膝盖</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 text-sm">人脸居中偏差度数</label>
                    <input
                        type="number"
                        step={1}
                        value={faceCenterOffsetDeg}
                        onChange={e => setFaceCenterOffsetDeg(Number(e.target.value))}
                        className="w-full mt-2 bg-slate-900 text-white p-2 rounded"
                    />
                  </div>

                  <button
                      onClick={handleSubmitAlignmentPerson}
                      className="w-full py-2 rounded-xl bg-emerald-500 text-white"
                  >
                    提交
                  </button>

                  {alignmentError && (
                      <div className="text-red-400 text-sm">{alignmentError}</div>
                  )}
                </div>
            )}
          </div>

          {error && (
              <div className="text-red-400 text-sm">{error}</div>
          )}

          <div>
            <label className="text-slate-300">摄像头</label>
            <select
                disabled={isStreaming}
                value={selectedCamera}
                onChange={e => setSelectedCamera(e.target.value)}
                className="w-full mt-2 bg-slate-800 text-white p-2 rounded"
            >
              {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `摄像头 ${i + 1}`}
                  </option>
              ))}
            </select>
          </div>
          <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
          />
        </div>
      </div>
  );
}

export default LivePusher;
