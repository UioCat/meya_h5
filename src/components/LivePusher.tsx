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
  const [personRatioPercentOffset, setPersonRatioPercentOffset] = useState(5);
  const [personCenterPosition, setPersonCenterPosition] = useState('眼睛');
  const [personCenterPositionOffsetPercent, setPersonCenterPositionOffsetPercent] = useState(3);
  const [faceCenterOffsetDeg, setFaceCenterOffsetDeg] = useState(3);
  const [alignmentError, setAlignmentError] = useState('');
  const [moveGuide, setMoveGuide] = useState<{
    pitch?: number;
    roll?: number;
    yaw?: number;
    throttle?: number;
  } | null>(null);
  const [renderAspect, setRenderAspect] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [rawInfo, setRawInfo] = useState<{
    ratio?: number;
    bbox?: [number, number, number, number];
    centerPoint?: [number, number];
    yaw?: number;
  } | null>(null);
  const [imageSearchInfo, setImageSearchInfo] = useState<{
    statusCode?: number;
    statusMessage?: string;
    matchedPoints?: number;
    quad?: {
      leftTop: [number, number];
      rightTop: [number, number];
      rightBottom: [number, number];
      leftBottom: [number, number];
    };
    targetCenter?: [number, number];
  } | null>(null);
  const [taskOffNotice, setTaskOffNotice] = useState(false);
  const taskOffTimerRef = useRef<number | null>(null);
  const videoWrapRef = useRef<HTMLDivElement | null>(null);

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
          if (parsed?.command === 'task_off') {
            setTaskOffNotice(true);
            if (taskOffTimerRef.current) {
              window.clearTimeout(taskOffTimerRef.current);
            }
            taskOffTimerRef.current = window.setTimeout(() => {
              setTaskOffNotice(false);
            }, 1000);
          }
          if (parsed?.command === 'move' && parsed?.param) {
            setMoveGuide({
              pitch: parsed.param.pitch,
              roll: parsed.param.roll,
              yaw: undefined,
              throttle: undefined
            });
          }

          if (parsed?.command === 'adjust' && parsed?.param) {
            setMoveGuide({
              pitch: undefined,
              roll: undefined,
              yaw: parsed.param.yaw,
              throttle: parsed.param.throttle
            });
          }

          if (parsed && parsed.type === 'move') {
            // 兼容旧协议（type=move, move/raw）
            if (parsed.move) {
              setMoveGuide(prev => ({
                ...(prev || {}),
                pitch: parsed.move.pitch,
                roll: parsed.move.roll,
                yaw: parsed.move.circle
              }));
            }
          }

          if (parsed?.raw) {
            if (
                typeof parsed.raw?.statusCode === 'number' ||
                parsed.raw?.targetInfo ||
                parsed.raw?.targetCenter
            ) {
              const targetInfo = parsed.raw?.targetInfo || {};
              const leftTop = targetInfo.leftTop;
              const rightTop = targetInfo.rightTop;
              const rightBottom = targetInfo.rightBottom;
              const leftBottom = targetInfo.leftBottom || targetInfo.leftBotton;
              setImageSearchInfo({
                statusCode: parsed.raw?.statusCode,
                statusMessage: parsed.raw?.statusMessage,
                matchedPoints:
                    parsed.raw?.matchedPoints ?? targetInfo?.matchedPoints,
                quad:
                    Array.isArray(leftTop) &&
                    leftTop.length === 2 &&
                    Array.isArray(rightTop) &&
                    rightTop.length === 2 &&
                    Array.isArray(rightBottom) &&
                    rightBottom.length === 2 &&
                    Array.isArray(leftBottom) &&
                    leftBottom.length === 2
                        ? {
                          leftTop: [leftTop[0], leftTop[1]],
                          rightTop: [rightTop[0], rightTop[1]],
                          rightBottom: [rightBottom[0], rightBottom[1]],
                          leftBottom: [leftBottom[0], leftBottom[1]]
                        }
                        : undefined,
                targetCenter:
                    Array.isArray(parsed.raw?.targetCenter) &&
                    parsed.raw.targetCenter.length === 2
                        ? [parsed.raw.targetCenter[0], parsed.raw.targetCenter[1]]
                        : undefined
              });
            }

            const nextRaw: {
              ratio?: number;
              bbox?: [number, number, number, number];
              centerPoint?: [number, number];
              yaw?: number;
            } = {};

            if (typeof parsed.raw?.object?.ratio === 'number') {
              nextRaw.ratio = parsed.raw.object.ratio;
            }
            if (parsed.raw?.object?.bbox && Array.isArray(parsed.raw.object.bbox)) {
              const bbox = parsed.raw.object.bbox;
              if (bbox.length === 4) {
                // bbox: [origin_x, origin_y, width, height]
                nextRaw.bbox = [bbox[0], bbox[1], bbox[2], bbox[3]];
              }
            }
            if (
                parsed.raw?.pose?.center_point &&
                Array.isArray(parsed.raw.pose.center_point) &&
                parsed.raw.pose.center_point.length === 2
            ) {
              nextRaw.centerPoint = [
                parsed.raw.pose.center_point[0],
                parsed.raw.pose.center_point[1]
              ];
            }
            if (typeof parsed.raw?.head?.yaw === 'number') {
              nextRaw.yaw = parsed.raw.head.yaw;
            }

            if (Object.keys(nextRaw).length > 0) {
              setRawInfo(nextRaw);
            }
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

  useEffect(() => {
    const container = document.getElementById('videoContainer');
    if (!container) return;

    const updateAspectFromEl = (el: HTMLVideoElement | HTMLCanvasElement) => {
      const width =
          el instanceof HTMLVideoElement ? el.videoWidth : el.width;
      const height =
          el instanceof HTMLVideoElement ? el.videoHeight : el.height;
      if (width > 0 && height > 0) {
        setRenderAspect(`${width} / ${height}`);
        setSourceSize({ width, height });
      }
    };

    const tryAttach = () => {
      const video = container.querySelector('video') as HTMLVideoElement | null;
      if (video) {
        const onMeta = () => updateAspectFromEl(video);
        video.addEventListener('loadedmetadata', onMeta);
        onMeta();
        return () => video.removeEventListener('loadedmetadata', onMeta);
      }

      const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
      if (canvas) {
        updateAspectFromEl(canvas);
      }

      return () => {};
    };

    let detach = tryAttach();
    const observer = new MutationObserver(() => {
      detach();
      detach = tryAttach();
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      detach();
    };
  }, []);

  useEffect(() => {
    const el = videoWrapRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(el);
    return () => ro.disconnect();
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
    setImageSearchInfo(null);
    fileInputRef.current?.click();
  };

  const handleSubmitAlignmentPerson = async () => {
    setAlignmentError('');
    // 重新提交任务时清空画面提示
    setRawInfo(null);
    setMoveGuide(null);
    setTaskOffNotice(false);
    try {
      await fetch(WEB_SERVER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'alignment_person',
          person_ratio_percent: personRatioPercent,
          person_ratio_percent_offset: personRatioPercentOffset,
          center_position: personCenterPosition,
          center_position_offset_percent: personCenterPositionOffsetPercent,
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

    // ⭐ 默认优先后置摄像头
    if (cameras.length) {
      const backCamera =
          cameras.find(c =>
              /back|rear|environment|后置|后摄|主摄/i.test(c.label || '')
          ) || cameras[0];
      setSelectedCamera(prev => prev || backCamera.deviceId);
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

      const defaultCameraId = devices[0]?.deviceId;
      if (selectedCamera && selectedCamera !== defaultCameraId) {
        await pusher.getDeviceManager().switchCamera(selectedCamera);
        // 切换摄像头后等待 1s 再启动推流，避免黑屏
        await new Promise(resolve => setTimeout(resolve, 1000));
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
    setRenderAspect(null);

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
          <h1 className="text-3xl font-bold text-white">Meya Web</h1>

          <div
              className="bg-black rounded-xl relative overflow-hidden"
              style={renderAspect ? { aspectRatio: renderAspect } : undefined}
              ref={videoWrapRef}
          >
            <div id="videoContainer" className="w-full h-full" />
            <style>{`
              #videoContainer video,
              #videoContainer canvas {
                width: 100%;
                height: 100%;
                object-fit: cover;
              }
            `}</style>

            {activeMode === 'alignment_person' &&
                (rawInfo?.bbox || rawInfo?.centerPoint || rawInfo?.ratio !== undefined || rawInfo?.yaw !== undefined) &&
                sourceSize &&
                containerSize && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-3 top-3 text-xs text-white space-y-2">
                    <div className="bg-black/60 px-2 py-1 rounded">
                      人体占比：
                      {rawInfo.ratio !== undefined
                          ? `${(rawInfo.ratio * 100).toFixed(2)}%`
                          : '--'}
                      <span className="ml-2">
                        人脸相对镜头偏移角度：
                        {rawInfo.yaw !== undefined
                            ? `${rawInfo.yaw.toFixed(2)}°`
                            : '--'}
                      </span>
                    </div>
                    <div className="bg-black/60 px-2 py-1 rounded space-y-1">
                      <div>画面说明</div>
                      <div>绿色点：人像-{personCenterPosition}的中心点</div>
                      <div>
                        红色点 + 红色圆：画面中心与居中偏差范围（{personCenterPositionOffsetPercent}%）
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const scaleX = containerSize.width / sourceSize.width;
                    const scaleY = containerSize.height / sourceSize.height;
                    return (
                        <>
                          {rawInfo.bbox && (() => {
                            const [originX, originY, boxWidth, boxHeight] = rawInfo.bbox!;
                            const left = originX * scaleX;
                            const top = originY * scaleY;
                            const width = boxWidth * scaleX;
                            const height = boxHeight * scaleY;
                            return (
                                <div
                                    className="absolute border-2 border-emerald-400"
                                    style={{
                                      left,
                                      top,
                                      width,
                                      height
                                    }}
                                />
                            );
                          })()}
                          {rawInfo.centerPoint && (() => {
                            const [cx, cy] = rawInfo.centerPoint!;
                            const left = cx * scaleX;
                            const top = cy * scaleY;
                            return (
                                <div
                                    className="absolute w-3 h-3 bg-emerald-400 rounded-full -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                      left,
                                      top
                                    }}
                                />
                            );
                          })()}
                          {(() => {
                            const centerX = containerSize.width / 2;
                            const centerY = containerSize.height / 2;
                            const diag = Math.hypot(
                                containerSize.width,
                                containerSize.height
                            );
                            const offsetLen =
                                (diag * personCenterPositionOffsetPercent) / 100;
                            const boxSize = offsetLen * 2;
                            return (
                                <>
                                  <div
                                      className="absolute w-3 h-3 bg-red-500/70 rounded-full -translate-x-1/2 -translate-y-1/2"
                                      style={{
                                        left: centerX,
                                        top: centerY
                                      }}
                                  />
                                  <div
                                      className="absolute border-2 border-red-500/60 rounded-full border-dashed"
                                      style={{
                                        left: centerX - boxSize / 2,
                                        top: centerY - boxSize / 2,
                                        width: boxSize,
                                        height: boxSize
                                      }}
                                  />
                                </>
                            );
                          })()}
                        </>
                    );
                  })()}
                </div>
            )}

            {activeMode === 'image_search' &&
                imageSearchInfo &&
                sourceSize &&
                containerSize && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-3 top-3 text-xs text-white">
                    <div className="bg-black/60 px-2 py-1 rounded">
                      定位状态：
                      {imageSearchInfo.statusCode === 201
                          ? '发现目标'
                          : imageSearchInfo.statusCode === 202
                              ? '定位成功'
                              : imageSearchInfo.statusCode === 203
                                  ? '未发现目标'
                                  : '--'}
                      <span className="ml-2">状态码：{imageSearchInfo.statusCode ?? '--'}</span>
                      <span className="ml-2">匹配点：{imageSearchInfo.matchedPoints ?? '--'}</span>
                    </div>
                  </div>
                  {imageSearchInfo.quad && (() => {
                    const scaleX = containerSize.width / sourceSize.width;
                    const scaleY = containerSize.height / sourceSize.height;
                    const clamp = (v: number, min: number, max: number) =>
                        Math.max(min, Math.min(max, v));
                    const mapPoint = (p: [number, number]): [number, number] => [
                      clamp(p[0] * scaleX, 0, containerSize.width),
                      clamp(p[1] * scaleY, 0, containerSize.height)
                    ];
                    const p1 = mapPoint(imageSearchInfo.quad!.leftTop);
                    const p2 = mapPoint(imageSearchInfo.quad!.rightTop);
                    const p3 = mapPoint(imageSearchInfo.quad!.rightBottom);
                    const p4 = mapPoint(imageSearchInfo.quad!.leftBottom);
                    const lineIntersection = (
                        a: [number, number],
                        b: [number, number],
                        c: [number, number],
                        d: [number, number]
                    ): [number, number] | null => {
                      const x1 = a[0], y1 = a[1];
                      const x2 = b[0], y2 = b[1];
                      const x3 = c[0], y3 = c[1];
                      const x4 = d[0], y4 = d[1];
                      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
                      if (Math.abs(den) < 1e-6) return null;
                      const px =
                          ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
                      const py =
                          ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
                      return [
                        clamp(px, 0, containerSize.width),
                        clamp(py, 0, containerSize.height)
                      ];
                    };
                    const focus =
                        lineIntersection(p1, p3, p2, p4) ||
                        (imageSearchInfo.targetCenter
                            ? mapPoint(imageSearchInfo.targetCenter)
                            : null);

                    return (
                        <svg
                            className="absolute inset-0 w-full h-full"
                            viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
                        >
                          <polygon
                              points={`${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]} ${p4[0]},${p4[1]}`}
                              fill="none"
                              stroke="#34d399"
                              strokeWidth="2"
                          />
                          <line x1={p1[0]} y1={p1[1]} x2={p3[0]} y2={p3[1]} stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 4" />
                          <line x1={p2[0]} y1={p2[1]} x2={p4[0]} y2={p4[1]} stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 4" />
                          {focus && <circle cx={focus[0]} cy={focus[1]} r="5" fill="#34d399" />}
                        </svg>
                    );
                  })()}
                </div>
            )}
            {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <Video className="w-14 h-14" />
                </div>
            )}

            {moveGuide && (
                <div className="absolute inset-0 pointer-events-none text-white">
                  {moveGuide.pitch !== undefined && moveGuide.pitch !== 0 && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-4 flex flex-col items-center">
                        <div className="text-sm bg-black/60 px-3 py-1 rounded">
                          {moveGuide.pitch > 0 ? '向前' : '向后'}
                        </div>
                        {moveGuide.pitch > 0 ? (
                            <svg
                                className="w-14 h-14 mt-2"
                                viewBox="0 0 1024 1024"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                  d="M511.879529 0L60.235294 477.906824l290.514824-0.120471 0.783058 545.731765 321.355295 0.481882V477.786353L963.764706 478.027294 511.879529 0z"
                                  fill="#46bc4e"
                              />
                            </svg>
                        ) : (
                            <svg
                                className="w-14 h-14 mt-2"
                                viewBox="0 0 1024 1024"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                  d="M512.120471 1024L963.764706 546.093176l-290.514824 0.120471-0.783058-545.731765L351.111529 0v546.213647L60.235294 545.972706 512.120471 1024z"
                                  fill="#46bc4e"
                              />
                            </svg>
                        )}
                      </div>
                  )}

                  {moveGuide.roll !== undefined && moveGuide.roll !== 0 && (
                      <>
                        {moveGuide.roll < 0 && (
                            <div className="absolute top-1/2 -translate-y-1/2 left-6 flex items-center gap-2 text-emerald-400">
                              <svg
                                  className="w-12 h-12"
                                  viewBox="0 0 1137 1024"
                                  xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                    d="M1051.648 728.860444H552.732444v265.936593a61.591704 61.591704 0 0 1-87.115851 0.113778l-0.113778-0.113778-436.148148-439.333926a62.65363 62.65363 0 0 1 0-88.026074L465.464889 28.48237a60.946963 60.946963 0 0 1 86.167704-1.061926l1.061926 1.061926v265.519408h498.953481c40.997926 0 74.258963 33.261037 74.258963 74.258963v286.34074a74.221037 74.221037 0 0 1-74.258963 74.258963z"
                                    fill="#46bc4e"
                                />
                              </svg>
                              <div className="text-base bg-black/60 px-2 py-1 rounded text-white">向左</div>
                            </div>
                        )}
                        {moveGuide.roll > 0 && (
                            <div className="absolute top-1/2 -translate-y-1/2 right-6 flex items-center gap-2 text-emerald-400">
                              <div className="text-base bg-black/60 px-2 py-1 rounded text-white">向右</div>
                              <svg
                                  className="w-12 h-12"
                                  viewBox="0 0 1024 1024"
                                  xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                    d="M997.052632 512L458.105263 0v323.368421H26.947368v377.263158h431.157895v323.368421l538.947369-512z"
                                    fill="#46bc4e"
                                />
                                <path
                                    d="M929.738105 512l-431.157894-404.210526v260.473263l-430.618948 0.377263-0.538947 287.312842 431.157895-2.479158V916.210526l431.157894-404.210526z"
                                    fill="#46bc4e"
                                />
                              </svg>
                            </div>
                        )}
                      </>
                  )}

                  {moveGuide.yaw !== undefined && moveGuide.yaw !== 0 && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                        <div className="text-sm bg-black/60 px-3 py-1 rounded flex items-center gap-2">
                          {moveGuide.yaw > 0 ? (
                              <svg
                                  className="w-7 h-7"
                                  viewBox="0 0 1024 1024"
                                  xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                    d="M846.7456 272.3328L808.0384 128l-40.5504 70.2976A405.9648 405.9648 0 0 0 563.2 142.4384a409.6 409.6 0 0 0-173.1584 780.9024 25.6 25.6 0 1 0 21.76-46.1824 358.4 358.4 0 0 1 151.5008-683.3152 355.2768 355.2768 0 0 1 178.7392 48.8448l-39.5264 68.5056z"
                                    fill="#46bc4e"
                                    opacity=".2"
                                />
                                <path
                                    d="M846.7456 246.784l-38.7072-144.3328-40.5504 70.2976A405.9648 405.9648 0 0 0 563.2 116.8896a409.6 409.6 0 0 0-173.1584 780.9024 25.6 25.6 0 1 0 21.76-46.1824 358.4 358.4 0 0 1 151.5008-683.3152 355.2768 355.2768 0 0 1 178.7392 48.8448l-39.5264 68.5056z"
                                    fill="#46bc4e"
                                />
                              </svg>
                          ) : (
                              <svg
                                  className="w-7 h-7"
                                  viewBox="0 0 1024 1024"
                                  xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                    d="M153.6 272.3328L192.256 128l40.6016 70.2976a405.76 405.76 0 0 1 204.2368-55.8592 409.6 409.6 0 0 1 173.2096 780.9024 25.6 25.6 0 1 1-21.6576-46.3872 358.4 358.4 0 0 0-151.552-683.3152 355.2768 355.2768 0 0 0-178.7392 48.8448l39.5776 68.5056z"
                                    fill="#46bc4e"
                                    opacity=".2"
                                />
                                <path
                                    d="M153.6 246.784l38.656-144.3328 40.6016 70.2976a405.76 405.76 0 0 1 204.2368-55.8592 409.6 409.6 0 0 1 173.2096 780.9024 25.6 25.6 0 1 1-21.6576-46.3872 358.4 358.4 0 0 0-151.552-683.3152 355.2768 355.2768 0 0 0-178.7392 48.8448l39.5776 68.5056z"
                                    fill="#46bc4e"
                                />
                              </svg>
                          )}
                          {moveGuide.yaw > 0 ? '顺时针转' : '逆时针转'}
                        </div>
                      </div>
                  )}

                  {moveGuide.throttle !== undefined && moveGuide.throttle !== 0 && (
                      <div className="absolute right-4 top-4 flex flex-col items-center">
                        <div className="text-sm bg-black/60 px-3 py-1 rounded mb-2">
                          {moveGuide.throttle > 0 ? '向上' : '向下'}
                        </div>
                        {moveGuide.throttle > 0 ? (
                            <svg
                                className="w-12 h-12"
                                viewBox="0 0 1024 1024"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                  d="M511.879529 0L60.235294 477.906824l290.514824-0.120471 0.783058 545.731765 321.355295 0.481882V477.786353L963.764706 478.027294 511.879529 0z"
                                  fill="#46bc4e"
                              />
                            </svg>
                        ) : (
                            <svg
                                className="w-12 h-12"
                                viewBox="0 0 1024 1024"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                  d="M512.120471 1024L963.764706 546.093176l-290.514824 0.120471-0.783058-545.731765L351.111529 0v546.213647L60.235294 545.972706 512.120471 1024z"
                                  fill="#46bc4e"
                              />
                            </svg>
                        )}
                      </div>
                  )}
                </div>
            )}

            {activeMode === 'alignment_person' && taskOffNotice && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-3xl md:text-4xl font-bold text-emerald-400 bg-black/60 px-6 py-3 rounded-xl">
                    算法启动成功，开始识别中
                  </div>
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

          <div className="flex space-x-3 items-center">
            <select
                disabled={isStreaming}
                value={selectedCamera}
                onChange={e => setSelectedCamera(e.target.value)}
                className="bg-slate-700 text-white p-3 rounded-xl"
            >
              {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `摄像头 ${i + 1}`}
                  </option>
              ))}
            </select>

            <button
                onClick={isStreaming ? stopStream : startStream}
                className={`flex-1 py-3 rounded-xl ${
                    isStreaming ? 'bg-red-500' : 'bg-blue-500'
                }`}
            >
              {isStreaming ? '停止推流' : '开始推流'}
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
                    <label className="text-slate-300 text-sm">人体占比百分比偏差</label>
                    <input
                        type="number"
                        step={1}
                        value={personRatioPercentOffset}
                        onChange={e => setPersonRatioPercentOffset(Number(e.target.value))}
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
                    <label className="text-slate-300 text-sm">居中位置偏差百分比</label>
                    <input
                        type="number"
                        step={1}
                        value={personCenterPositionOffsetPercent}
                        onChange={e => setPersonCenterPositionOffsetPercent(Number(e.target.value))}
                        className="w-full mt-2 bg-slate-900 text-white p-2 rounded"
                    />
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
