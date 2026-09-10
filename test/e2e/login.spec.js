import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 获取打包编译后的 Electron 可执行文件绝对路径
 * 支持跨平台（Windows / macOS / Linux）自动识别
 */
function getPackagedExecutablePath() {
  const rootDir = path.resolve(__dirname, '../../');
  if (process.platform === 'win32') {
    return path.join(rootDir, 'release', 'win-unpacked', 'GuardianDApp.exe');
  } else if (process.platform === 'darwin') {
    return path.join(rootDir, 'release', 'mac', 'GuardianDApp.app', 'Contents', 'MacOS', 'GuardianDApp');
  } else {
    return path.join(rootDir, 'release', 'linux-unpacked', 'GuardianDApp');
  }
}

test.describe('PC 端 Electron 应用 E2E 自动化测试', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    const packagedPath = getPackagedExecutablePath();
    const isPackagedExist = fs.existsSync(packagedPath);

    // 优先启动编译打包后的可执行程序；若未打包则回退到 electron/main.cjs 源码模式启动
    if (isPackagedExist && !process.env.FORCE_SOURCE_ELECTRON) {
      console.log(`\n[E2E] 🚀 正在启动打包编译后的 Electron 应用: ${packagedPath}`);
      electronApp = await electron.launch({
        executablePath: packagedPath,
      });
    } else {
      console.log(`\n[E2E] ⚠️ 未发现打包程序或指定源码模式，启动开发源码: electron/main.cjs`);
      electronApp = await electron.launch({
        executablePath: electronPath,
        args: [path.resolve(__dirname, '../../electron/main.cjs')],
        env: {
          ...process.env,
          NODE_ENV: 'development',
        },
      });
    }

    // 获取应用打开的第一个 BrowserWindow 窗口
    window = await electronApp.firstWindow();

    // 等待页面 DOM 内容加载完毕
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('应成功启动 Electron 应用并渲染 LoginPage 核心表单元素', async () => {
    // 1. 验证应用标题（打包模式下为应用名或窗口标题）
    const title = await window.title();
    expect(title.length).toBeGreaterThan(0);

    // 2. 验证 LoginPage.jsx 中的品牌标题与英文标识
    const brandTitle = window.getByRole('heading', { name: '智能监护银行' });
    await expect(brandTitle).toBeVisible();

    const subtitle = window.getByText('Smart Guardianship Banking');
    await expect(subtitle).toBeVisible();

    // 3. 定位账号输入框、密码框与登录按钮
    const accountInput = window.getByPlaceholder('账号 / 手机号');
    const passwordInput = window.getByPlaceholder('密码');
    const submitBtn = window.getByRole('button', { name: /进入系统/ });

    await expect(accountInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test('应成功定位账号密码框并执行登录，断言成功跳转至 Dashboard 页面', async () => {
    // 1. 定位 LoginPage.jsx 中的账号输入框、密码输入框和登录主按钮
    const accountInput = window.getByPlaceholder('账号 / 手机号');
    const passwordInput = window.getByPlaceholder('密码');
    const submitBtn = window.getByRole('button', { name: /进入系统/ });

    // 2. 输入预置监护人账号（李四：13826193664，密码：123）
    await accountInput.fill('13826193664');
    await passwordInput.fill('123');

    // 3. 点击“进入系统”登录按钮
    await submitBtn.click();

    // 4. 断言页面是否成功跳转到了 Dashboard 页面
    // LoginPage.jsx 包含 1000ms 认证延时，Playwright 会自动轮询直到断言成功或超时
    const dashboardBadge = window.getByText('Blockchain Safety Dashboard');
    await expect(dashboardBadge).toBeVisible({ timeout: 10000 });

    // 5. 进一步断言 Dashboard 核心模块展示与登录态呈现
    await expect(window.getByText('您的钱包已受保护')).toBeVisible();
    await expect(window.getByTitle('退出登录')).toBeVisible();
  });

  test('应该支持管理员账号快速登录并成功跳转至超级管理员 Dashboard 控制台', async () => {
    // 定位输入框并填入管理员测试账号
    const accountInput = window.getByPlaceholder('账号 / 手机号');
    const passwordInput = window.getByPlaceholder('密码');
    const submitBtn = window.getByRole('button', { name: /进入系统/ });

    await accountInput.fill('admin');
    await passwordInput.fill('admin123');
    await submitBtn.click();

    // 断言是否成功跳转至超级管理员控制台
    const adminConsole = window.getByText('Blockchain Management Console');
    await expect(adminConsole).toBeVisible({ timeout: 10000 });
    await expect(window.getByText('🛡️ 超级管理员视角')).toBeVisible();
    await expect(window.getByText('注册用户 (安全视图)')).toBeVisible();
  });

  test('应该支持通过快速切换直接选择本地已知账号免密登录至 Dashboard', async () => {
    // 切换到“快速切换”标签
    await window.getByRole('button', { name: '快速切换' }).click();
    await expect(window.getByText('本地已知账户')).toBeVisible();

    // 点击第一个本地已知账户
    const firstAccountCard = window.getByRole('button', { name: /李四|张三|成员|监护人/ }).first();
    await expect(firstAccountCard).toBeVisible();
    await firstAccountCard.click();

    // 断言是否直接进入 Dashboard
    const dashboardBadge = window.getByText('Blockchain Safety Dashboard');
    await expect(dashboardBadge).toBeVisible({ timeout: 10000 });
  });
});
