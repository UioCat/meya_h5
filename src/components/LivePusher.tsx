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

  const pusherRef = useRef<any>(null);
  const deviceManagerRef = useRef<any>(null);

  const WS_SERVER = "wss://www.uiofield.top/meya/ws";
  const WEB_SERVER = "https://www.uiofield.top/meya/push"
  const PUSH_URL =
      'webrtc://226975.push.tlivecloud.com/live/stream?txSecret=a6fe99d6b2031929737cecbca4b45c1a&txTime=69895CD3';

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
      const msg =
          typeof event.data === 'string'
              ? event.data
              : JSON.stringify(event.data);

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


  // const requestCameraPermission = async () => {
  //   try {
  //     const stream = await navigator.mediaDevices.getUserMedia({
  //       video: true,
  //       audio: false
  //     });
  //
  //     // 立刻关闭，只是为了拿权限
  //     stream.getTracks().forEach(track => track.stop());
  //   } catch {
  //     throw new Error('摄像头权限被拒绝');
  //   }
  // };
  const handleUploadTemplate = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        await fetch(WEB_SERVER, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'upload_template',
            filename: file.name,
            contentType: file.type,
            streamUrl: "http://play.uiofield.top/live/stream.flv",
            data: reader.result // base64
          })
        });
      } catch (err) {
        console.error('文件上传失败', err);
      }
    };

    reader.readAsDataURL(file);

    // 清空 input，允许重复上传同一张
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

      // ⭐ 使用用户已选择的摄像头
      // if (selectedCamera) {
      //   await pusher.getDeviceManager().switchCamera(selectedCamera);
      // }
      //
      // await pusher.startCamera();
      // await pusher.startPush(PUSH_URL);
      // 1️⃣ 先启动摄像头（会用默认设备）
      await pusher.startCamera();

      // 2️⃣ 再切换到用户选择的摄像头（这一步才会生效）
      if (selectedCamera) {
        await pusher.getDeviceManager().switchCamera(selectedCamera);
      }

      // 3️⃣ 再推流
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

  return (
      <div className="p-6 bg-slate-900 min-h-screen">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold text-white">腾讯云 Web 推流</h1>

          <div className="bg-black aspect-video rounded-xl relative">
            <div id="videoContainer" className="w-full h-full" />
            {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <Video className="w-14 h-14" />
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
            <div className="text-slate-300 mb-2">WebSocket 消息</div>

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

          {/*<div className="flex space-x-3">*/}
          {/*  <button*/}
          {/*      onClick={isStreaming ? stopStream : startStream}*/}
          {/*      className={`flex-1 py-3 rounded-xl ${*/}
          {/*          isStreaming ? 'bg-red-500' : 'bg-blue-500'*/}
          {/*      }`}*/}
          {/*  >*/}
          {/*    {isStreaming ? '停止推流' : '开始推流'}*/}
          {/*  </button>*/}

          {/*  <button*/}
          {/*      onClick={toggleCamera}*/}
          {/*      disabled={!isStreaming}*/}
          {/*      className="p-3 bg-slate-700 rounded-xl"*/}
          {/*  >*/}
          {/*    {isCameraOn ? <Video /> : <VideoOff />}*/}
          {/*  </button>*/}
          {/*</div>*/}
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

            {/* ⭐ 新增上传模版图按钮 */}
            <button
                onClick={handleUploadTemplate}
                className="px-4 py-3 bg-slate-700 rounded-xl text-white"
            >
              上传模版图
            </button>
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
