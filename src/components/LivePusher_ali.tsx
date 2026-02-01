import { useState, useRef, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, Radio } from 'lucide-react';
import { AliRTSPusher } from 'aliyun-rts-pusher';

declare global {
  interface Window {
    AliRTS: any;
  }
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

function LivePusher() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  // const [isMicOn, setIsMicOn] = useState(true);
  const [devices, setDevices] = useState<{ cameras: DeviceInfo[]; microphones: DeviceInfo[] }>({
    cameras: [],
    microphones: []
  });
  const [selectedCamera, setSelectedCamera] = useState('');
  // const [selectedMic, setSelectedMic] = useState('');
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState('未连接');

  const videoRef = useRef<HTMLVideoElement>(null);
  const pusherRef = useRef<any>(null);
  // const streamRef = useRef<MediaStream | null>(null);

  const PUSH_URL = 'artc://push.uiofield.top/live/live?auth_key=1769326012-0-0-84624b7ae7fa81de14bd3f33d59e8e4a';

  useEffect(() => {
    enumerateDevices();
    return () => {
      stopStream();
    };
  }, []);

  const enumerateDevices = async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const cameras = deviceList
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `摄像头 ${device.deviceId.slice(0, 5)}`
        }));

      // const microphones = deviceList
      //   .filter(device => device.kind === 'audioinput')
      //   .map(device => ({
      //     deviceId: device.deviceId,
      //     label: device.label || `麦克风 ${device.deviceId.slice(0, 5)}`
      //   }));

      // setDevices({ cameras, microphones });
      setDevices({ cameras, microphones: [] });
      if (cameras.length > 0 && !selectedCamera) {
        setSelectedCamera(cameras[0].deviceId);
      }
      // if (microphones.length > 0 && !selectedMic) {
      //   setSelectedMic(microphones[0].deviceId);
      // }
    } catch (err) {
      setError('无法获取设备列表: ' + (err as Error).message);
    }
  };

  const startStream = async () => {
    try {
      setError('');
      setStreamStatus('正在连接...');

      // 1. 创建推流实例
      const pushClient = AliRTSPusher.createClient({
        // audio: false,
        enableAudio: false
      });
      pusherRef.current = pushClient;
      console.log('push client create success');

      // 2. 设置本地预览容器
      const videoEl = pushClient.setRenderView('videoContainer');

      videoEl.muted = true;
      console.log('video element set success');

      // 3. 设置视频质量
      pushClient.setVideoQuality('720p_1');

      // 4. 监听事件
      pushClient.on('error', (err: any) => {
        console.error('push stream error', err);
        console.error(err);
        setError(`推流错误：${err.errorCode}`);
        setIsStreaming(false);
      });

      pushClient.on('connectStatusChange', (e: any) => {
        setStreamStatus(e.status);
      });

      // 5. 开始采集
      await pushClient.startCamera({
        cameraId: selectedCamera || undefined,
      });

      // 不需要音频
      await pushClient.startMicrophone({
        // microphoneId: selectedMic || undefined,
        microphoneId: null
      });

      // 6. 开始推流
      await pushClient.startPush(PUSH_URL);

      await pushClient.stopMicrophone();

      setIsStreaming(true);
      setStreamStatus('直播中');
    } catch (err) {
      console.error(err);
      setError('启动推流失败：' + (err as Error).message);
      setIsStreaming(false);
    }
  };

  const stopStream = () => {
    if (!pusherRef.current) return;

    try {
      pusherRef.current.stopPush();
      pusherRef.current.stopCamera();
      pusherRef.current.stopMicrophone();
      pusherRef.current.destroy();
    } catch (e) {
      console.warn(e);
    }

    pusherRef.current = null;
    setIsStreaming(false);
    setStreamStatus('未连接');
  };


  const toggleCamera = async () => {
    if (!pusherRef.current) return;

    if (isCameraOn) {
      pusherRef.current.stopCamera();
    } else {
      await pusherRef.current.startCamera();
    }

    setIsCameraOn(!isCameraOn);
  };

  // const toggleMic = async () => {
  //   if (!pusherRef.current) return;
  //
  //   if (isMicOn) {
  //     pusherRef.current.stopMicrophone();
  //   } else {
  //     await pusherRef.current.startMicrophone();
  //   }
  //
  //   setIsMicOn(!isMicOn);
  // };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">阿里云直播推流</h1>
          <p className="text-slate-400">支持电脑和手机浏览器的实时推流</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="relative aspect-video bg-black">
              {/*<video*/}
              {/*  ref={videoRef}*/}
              {/*  autoPlay*/}
              {/*  playsInline*/}
              {/*  muted*/}
              {/*  className="w-full h-full object-cover"*/}
              {/*/>*/}
              <div className="relative aspect-video bg-black">
                <div
                    id="videoContainer"
                    className="w-full h-full object-cover"
                />
                {!isStreaming && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center">
                        <Video className="w-16 h-16 text-slate-500 mx-auto mb-2" />
                        <p className="text-slate-400">预览区域</p>
                      </div>
                    </div>
                )}
              </div>

              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-center">
                    <Video className="w-16 h-16 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400">预览区域</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
                  <span className="text-white font-medium">{streamStatus}</span>
                </div>
                {isStreaming && (
                  <div className="flex items-center space-x-1 text-red-500">
                    <Radio className="w-4 h-4" />
                    <span className="text-sm">直播中</span>
                  </div>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={isStreaming ? stopStream : startStream}
                  className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all transform hover:scale-105 ${
                    isStreaming
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  {isStreaming ? '停止推流' : '开始推流'}
                </button>
                <button
                  onClick={toggleCamera}
                  disabled={!isStreaming}
                  className={`p-3 rounded-xl transition-all ${
                    isStreaming
                      ? isCameraOn
                        ? 'bg-slate-700 hover:bg-slate-600 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isCameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
                {/*<button*/}
                {/*  // onClick={toggleMic}*/}
                {/*  disabled={!isStreaming}*/}
                {/*  className={`p-3 rounded-xl transition-all ${*/}
                {/*    isStreaming*/}
                {/*      ? isMicOn*/}
                {/*        ? 'bg-slate-700 hover:bg-slate-600 text-white'*/}
                {/*        : 'bg-red-500 hover:bg-red-600 text-white'*/}
                {/*      : 'bg-slate-700 text-slate-500 cursor-not-allowed'*/}
                {/*  }`}*/}
                {/*>*/}
                {/*  /!*{isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}*!/*/}
                {/*</button>*/}
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-xl">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">设备设置</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    摄像头
                  </label>
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    disabled={isStreaming}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {devices.cameras.map(camera => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  {/*<label className="block text-sm font-medium text-slate-300 mb-2">*/}
                  {/*  麦克风*/}
                  {/*</label>*/}
                  {/*<select*/}
                  {/*  value={selectedMic}*/}
                  {/*  onChange={(e) => setSelectedMic(e.target.value)}*/}
                  {/*  disabled={isStreaming}*/}
                  {/*  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"*/}
                  {/*>*/}
                  {/*  {devices.microphones.map(mic => (*/}
                  {/*    <option key={mic.deviceId} value={mic.deviceId}>*/}
                  {/*      {mic.label}*/}
                  {/*    </option>*/}
                  {/*  ))}*/}
                  {/*</select>*/}
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">推流信息</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-400 mb-1">推流地址</p>
                  <div className="p-3 bg-slate-900 rounded-lg">
                    <p className="text-xs text-slate-300 break-all font-mono">{PUSH_URL}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">摄像头状态</p>
                    <p className={`text-sm font-medium ${isCameraOn ? 'text-green-400' : 'text-red-400'}`}>
                      {isCameraOn ? '已开启' : '已关闭'}
                    </p>
                  </div>
                  <div>
                    {/*<p className="text-sm text-slate-400 mb-1">麦克风状态</p>*/}
                    {/*<p className={`text-sm font-medium ${isMicOn ? 'text-green-400' : 'text-red-400'}`}>*/}
                    {/*  {isMicOn ? '已开启' : '已关闭'}*/}
                    {/*</p>*/}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-3">使用说明</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-start">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 mr-2 flex-shrink-0" />
                  选择要使用的摄像头和麦克风设备
                </li>
                <li className="flex items-start">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 mr-2 flex-shrink-0" />
                  点击"开始推流"按钮启动直播
                </li>
                <li className="flex items-start">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 mr-2 flex-shrink-0" />
                  推流过程中可以切换摄像头和麦克风的开关
                </li>
                <li className="flex items-start">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 mr-2 flex-shrink-0" />
                  点击"停止推流"结束直播
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LivePusher;
