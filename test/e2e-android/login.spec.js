describe('Capacitor Android 端到端测试', () => {
  it('应成功启动 APK，切入 WebView 上下文并验证 LoginPage 渲染', async () => {
    // 1. 验证当前初始上下文为原生应用
    const initialContext = await driver.getContext();
    console.log(`[Appium] 初始应用上下文: ${initialContext}`); // 输出: NATIVE_APP

    // 2. 轮询等待 WebView 上下文初始化完成（Capacitor 启动 Web 页面需要数秒）
    await driver.waitUntil(async () => {
      const contexts = await driver.getContexts();
      console.log('[Appium] 当前可用上下文列表:', contexts);
      return contexts.some(c => typeof c === 'string' && c.startsWith('WEBVIEW'));
    }, {
      timeout: 30000,
      interval: 1000,
      timeoutMsg: '未能探测到 WEBVIEW 上下文，请检查 Android WebView 调试模式是否就绪'
    });

    // 3. 提取并切换到 WEBVIEW 上下文
    const allContexts = await driver.getContexts();
    const webviewContext = allContexts.find(c => typeof c === 'string' && c.startsWith('WEBVIEW'));
    console.log(`[Appium] 正在切换至上下文: ${webviewContext}`);
    await driver.switchContext(webviewContext);

    // 4. 此时已进入 Web 渲染环境，使用标准 Web 元素选择器断言 LoginPage
    // 验证大标题“智能监护银行”
    const brandTitle = await $('h1');
    await brandTitle.waitForDisplayed({ timeout: 15000 });
    const titleText = await brandTitle.getText();
    expect(titleText).toContain('智能监护银行');

    // 验证英文副标题
    const subTitle = await $('*=Smart Guardianship');
    await expect(subTitle).toBeDisplayed();

    // 验证账号/手机号与密码输入框
    const phoneInput = await $('input[placeholder="账号 / 手机号"]');
    await expect(phoneInput).toBeDisplayed();

    const passwordInput = await $('input[placeholder="密码"]');
    await expect(passwordInput).toBeDisplayed();

    // 验证“进入系统”登录按钮
    const submitBtn = await $('button=进入系统');
    await expect(submitBtn).toBeDisplayed();

    // 5. 交互验证：尝试输入手机号与密码
    await phoneInput.setValue('13800000001');
    await passwordInput.setValue('123456');

    // 测试完毕切回原生上下文
    await driver.switchContext('NATIVE_APP');
  });
});
