import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('PC 端 Electron 应用 E2E 测试', () => {
  let electronApp;

  test.beforeEach(async () => {
    // 启动 Electron 二进制可执行程序并挂载入口 electron/main.cjs
    electronApp = await electron.launch({
      executablePath: electronPath,
      args: [path.resolve(__dirname, '../electron/main.cjs')],
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    });
  });

  test.afterEach(async () => {
    // 测试完成后退出应用
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('应成功启动 Electron 窗口并正常渲染 LoginPage', async () => {
    // 获取应用打开的第一个窗口 (BrowserWindow)
    const window = await electronApp.firstWindow();

    // 等待页面加载完成
    await window.waitForLoadState('domcontentloaded');

    // 1. 验证应用主窗口标题（由 index.html 的 title 定义）
    const title = await window.title();
    expect(title).toContain('GuardianDApp 智能监护银行');

    // 2. 验证 LoginPage.jsx 渲染的核心标识元素
    const brandTitle = window.getByRole('heading', { name: '智能监护银行' });
    await expect(brandTitle).toBeVisible();

    const subtitle = window.getByText('Smart Guardianship Banking');
    await expect(subtitle).toBeVisible();

    // 3. 验证登录输入框与密码框
    const phoneInput = window.getByPlaceholder('账号 / 手机号');
    await expect(phoneInput).toBeVisible();

    const passwordInput = window.getByPlaceholder('密码');
    await expect(passwordInput).toBeVisible();

    // 4. 验证登录主按钮
    const submitBtn = window.getByRole('button', { name: /进入系统/ });
    await expect(submitBtn).toBeVisible();

    // 5. 验证模式切换选项卡（登录 / 注册 / 快速切换）
    await expect(window.getByRole('button', { name: '登录' })).toBeVisible();
    await expect(window.getByRole('button', { name: '注册' })).toBeVisible();
    await expect(window.getByRole('button', { name: '快速切换' })).toBeVisible();
  });

  test('测试交互：支持切换登录/注册/快速切换模式', async () => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // 1. 切换到“注册”选项卡
    await window.getByRole('button', { name: '注册' }).click();
    await expect(window.getByPlaceholder('注册手机号')).toBeVisible();
    await expect(window.getByPlaceholder('设置密码')).toBeVisible();
    await expect(window.getByRole('button', { name: /完成注册并登录/ })).toBeVisible();

    // 2. 切换到“快速切换”选项卡
    await window.getByRole('button', { name: '快速切换' }).click();
    await expect(window.getByText('本地已知账户')).toBeVisible();

    // 3. 切换回“登录”选项卡
    await window.getByRole('button', { name: '登录' }).click();
    await expect(window.getByPlaceholder('账号 / 手机号')).toBeVisible();
    await expect(window.getByRole('button', { name: /进入系统/ })).toBeVisible();
  });
});
