/**
 * 如果是初始接入，请一定详细阅读文档后再集成小鱼易连WebSDK
 *
 * 当前使用XYLink Web SDK：v3.9.10
 * 产品介绍：https://openapi.xylink.com/common/meeting/doc/description?platform=web
 * 集成文档：https://openapi.xylink.com/common/meeting/doc/video_call?platform=web
 * API文档：https://openapi.xylink.com/common/meeting/api/description?platform=web
 */
// XYRTCClient模块
let XYClient = null;
let XYStream = null;
let contentTrack = null;
// 参会者布局列表数据
let layoutList = [];
// 缓存列表数据，做Diff使用
let cacheLayoutList = [];
// 声音通道数据
let audioList = [];
// 关闭摄像头
let muteVideo = true;
// 关闭麦克风
let muteAudio = true;

/**
 * 配置信息，请填写！！！
 */
// 网关应用ID
const clientId = '';
// 网关Secret
const clientSecret = '';
// 企业ID
const extId = '';
// 入会会议号
const confNumber = '';

const initSetting = () => {
  XYClient = null;
  XYStream = null;
  layoutList = [];
  cacheLayoutList = [];
  audioList = [];
  muteVideo = true;
  muteAudio = true;
};

const startCall = async () => {
  try {
    initSetting();

    const XYRTC = xyRTC.default;
    const response = await XYRTC.checkSupportWebRTC();

    if (!response.result) {
      alert('不支持WebRTC，请更换支持的浏览器');
      return;
    }

    XYRTC.logger.setLogLevel('INFO');

    XYClient = XYRTC.createClient({
      clientId,
      clientSecret,
      extId,
      container: {
        elementId: 'meeting',
      },
    });

    initEvent();

    const result = await XYClient.loginExternalAccount({
      displayName: '测试',
      // 企业账号登录，填写第三方用户ID，如果没有请填写随机ID
      extUserId: 'XXX',
      extId,
    });

    const token = result.detail.access_token;

    await XYClient.makeCall({
      token,
      // 输入会议号
      confNumber: '',
      // 入会密码，如果没有则不填写
      password: '',
      // 入会名称
      displayName: '测试88',
      muteVideo,
      muteAudio,
    });

    XYStream = XYRTC.createStream();
    await XYStream.init({});
    XYClient.publish(XYStream, { isSharePeople: true });
  } catch (err) {
    console.warn('呼叫失败，请检查：', err);
    alert(err.msg);
  }
};

const initEvent = () => {
  // 参会成员布局列表数据，包含参会者基本信息、位置、尺寸、旋转等数据
  XYClient.on('layout', (e) => {
    console.log('layout: ', e);

    layoutList = e;
    // 获取成员列表布局数据，直接渲染使用即可
    renderLayoutList();
  });

  // 布局容器尺寸和位置信息
  XYClient.on('screen-info', (e) => {
    console.log('screen info: ', e);

    // 给会议容器设置Layout容器最佳比例宽高信息
    updateLayoutContainerStyle(e);
  });

  // 音频轨道Tracks数据
  XYClient.on('audio-track', (e) => {
    console.log('audio track: ', e);

    audioList = e;
    // 获取到audio list数据后，直接渲染并播放即可
    renderAudioList();
  });

  // 会议呼叫状态事件
  XYClient.on('call-status', (e) => {
    // 呼叫状态处理
    console.log('call state: ', e);
  });

  // 强制挂断会议消息
  XYClient.on('disconnected', (e) => {
    console.log('disconnected: ', e);
    // 退会事件
    endCall();
  });
};

const updateLayoutContainerStyle = (style) => {
  const container = document.getElementById('layout');

  container.style.width = `${style.rateWidth}px`;
  container.style.height = `${style.rateHeight}px`;
};

const renderLayoutList = () => {
  const meetingContainer = document.getElementById('layout');

  diffInvalidLayout();

  layoutList.forEach((item) => {
    const { positionStyle = {}, rotate = {}, id, state } = item;
    const { displayName = '' } = item?.roster || {};
    const layoutItemId = 'wrap-' + id;
    const isExist = document.getElementById(layoutItemId);
    const { width, height, left, top } = positionStyle;
    // Layout外围容器样式
    const layoutItemStyle = `width: ${width}; height: ${height}; left: ${left}; top: ${top}`;
    const isPause = state === 'MUTE';

    // video样式，包含竖屏旋转样式
    let layoutVideoStyle = '';
    for (let key in rotate) {
      layoutVideoStyle += `${key}: ${rotate[key]};`;
    }

    if (!isExist) {
      // 初始渲染
      const layoutItemString = `
          <div class="layout_item" style="${layoutItemStyle}" id=${layoutItemId}>
            <div class="layout_name">${displayName}</div>
            <div class="layout_pause center ${isPause ? 'show' : 'hidden'}">视频暂停</div>
            <div class="center layout_video">
              <video class="video" style="${layoutVideoStyle}" playsinline autoplay muted></video>
            </div>
          </div>`;

      // 向容器中追加新的Layout画面Dom
      meetingContainer.insertAdjacentHTML('beforeend', layoutItemString);
      // id不变的情况下，只需要执行一次即可
      XYClient.setVideoRenderer(id, layoutItemId);
    } else {
      // 已渲染，更新样式和状态
      const layoutItemEle = document.getElementById(layoutItemId);
      const layoutNameEle = layoutItemEle.querySelector('.layout_name');
      const layoutVideoEle = layoutItemEle.querySelector('.video');
      const layoutPauseEle = layoutItemEle.querySelector('.layout_pause');

      layoutItemEle.style.cssText = layoutItemStyle;
      layoutNameEle.innerHTML = displayName;
      layoutVideoEle.style.cssText = layoutVideoStyle;
      layoutPauseEle.className = `center layout_pause ${isPause ? 'show' : 'hidden'}`;
    }
  });

  // 缓存上一组Layout List数据，下一次diff出离开会议的设备并清空DOM
  cacheLayoutList = JSON.parse(JSON.stringify(layoutList));
};

// diff出离开会议设备
const diffInvalidLayout = () => {
  const filterLayoutList = cacheLayoutList.filter((item) => {
    return !layoutList.some(({ id }) => id === item.id);
  });

  // 清理Video资源
  clearInvalidLayout(filterLayoutList);
};

const renderAudioList = () => {
  const audioContainer = document.getElementById('audios');

  audioList.forEach((item) => {
    const muted = item.status === 'local';
    const streamId = item.rest.streamId;
    const isExist = document.getElementById(streamId);

    if (!isExist) {
      const newAudio = document.createElement('audio');
      // 本地声音mute处理
      newAudio.muted = muted;
      newAudio.autoplay = true;
      newAudio.id = streamId;
      audioContainer.appendChild(newAudio);

      // 每个Audio Track只需执行一次setAudioRenderer即可
      XYClient.setAudioRenderer(streamId, newAudio);
    }
  });
};

const switchCamera = async () => {
  if (XYClient) {
    if (muteVideo) {
      await XYClient.unmuteVideo();
    } else {
      await XYClient.muteVideo();
    }

    muteVideo = !muteVideo;
  }
};

const switchMicrophone = async () => {
  if (XYClient) {
    if (muteAudio) {
      await XYClient.unmuteAudio();
    } else {
      await XYClient.muteAudio();
    }

    muteAudio = !muteAudio;
  }
};

// 离开会议
const endCall = async () => {
  if (XYClient) {
    layoutList = [];
    clearInvalidLayout(cacheLayoutList);
    clearInvalidAudios();

    XYStream.close();
    XYClient.destroy();
    console.log('离开会议成功');
  }
};

// 清理Video资源和DOM
const clearInvalidLayout = (list) => {
  list.forEach(({ id }) => {
    const layoutItemId = 'wrap-' + id;
    const layoutItemEle = document.getElementById(layoutItemId);
    // 移除layoutItemEle元素
    layoutItemEle.remove();
  });
};

// 清理Audio列表数据
const clearInvalidAudios = () => {
  document.getElementById('audios').innerHTML = '';
};

// 开始共享
const startShareContent = async () => {
  try {
    // screenAudio: true
    const result = await XYStream.createContentStream({ screenAudio: true });

    if (result) {
      XYStream.on('start-share-content', () => {
        // 推送 ContentTrack 模块
        XYClient.publish(XYStream, { isShareContent: true });
      });

      XYStream.on('stop-share-content', () => {
        // 停止分享
        stopShareContent();
      });
    }
  } catch (error) {
    stopShareContent();
  }
};

// 结束共享
const stopShareContent = async () => {
  XYClient.stopShareContent();
};
