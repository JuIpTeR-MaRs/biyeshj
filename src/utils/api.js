import { Capacitor } from '@capacitor/core';

/**
 * 判断是否运行在移动端原生环境 (Android / iOS)
 */
export const isNative = () => {
  if (typeof window !== 'undefined') {
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
      return true;
    }
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua) || window.location.protocol === 'capacitor:' || (window.location.hostname === 'localhost' && window.location.port === '')) {
      return true;
    }
  }
  return typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform();
};

/**
 * 获取服务主机 IP：
 * 1. 优先读取 localStorage 中的自定义配置 (方便真机调试填入 192.168.x.x)
 * 2. 如果在 Android 原生环境，默认使用 10.0.2.2 (Android 官方模拟器指向宿主机电脑的端口)
 * 3. 否则 (Web / Electron) 使用 127.0.0.1
 */
export const getHostIp = () => {
  if (typeof window !== 'undefined') {
    const customHost = localStorage.getItem('SERVER_HOST_IP');
    if (customHost) return customHost;
  }
  if (isNative()) {
    return '10.0.2.2';
  }
  return '127.0.0.1';
};

/**
 * 获取区块链 RPC 服务端点
 */
export const getRpcUrl = () => {
  const host = getHostIp();
  return `http://${host}:8545`;
};

/**
 * 获取后端 Mock / 业务 API 基础 URL
 */
export const getApiBaseUrl = () => {
  if (isNative()) {
    const host = getHostIp();
    return `http://${host}:3000`;
  }
  return '';
};

/**
 * 包装 API 路径，自动在移动端追加后端 Host 前缀
 * 例如: getApiUrl('/api/guardian/bind') => 'http://10.0.2.2:3000/api/guardian/bind'
 */
export const getApiUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
};
