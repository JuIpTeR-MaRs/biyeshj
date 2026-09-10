import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 每次测试用例执行后自动清理挂载的 DOM
afterEach(() => {
  cleanup();
});
