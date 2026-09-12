describe('Android 移动端 (Capacitor Hybrid App) E2E 自动化测试', () => {
  it('应成功启动 APK，切入 WebView 上下文并对“登录”按钮执行可见性断言', async () => {
    // -------------------------------------------------------------
    // 1. 获取初始上下文并校验
    // -------------------------------------------------------------
    const initialContext = await driver.getContext();
    console.log(`[Appium] 启动初始应用上下文: ${initialContext}`); // 通常为 NATIVE_APP

    // -------------------------------------------------------------
    // 2. 轮询探测并等待 WEBVIEW 上下文初始化就绪
    // Capacitor 应用启动时先渲染 Android 原生容器，随后异步初始化并加载 Web 资源
    // -------------------------------------------------------------
    await driver.waitUntil(
      async () => {
        const contexts = await driver.getContexts();
        console.log('[Appium] 探测当前设备可用上下文列表:', contexts);
        return contexts.some(
          (context) => typeof context === 'string' && context.toUpperCase().includes('WEBVIEW')
        );
      },
      {
        timeout: 35000,
        interval: 1000,
        timeoutMsg: '超时：未能在指定时间内探测到 WEBVIEW 上下文，请确认 Android 应用已正确开启 WebView 调试模式且已加载前端页面'
      }
    );

    // -------------------------------------------------------------
    // 3. 提取 WEBVIEW 上下文名称并执行切换 (Native -> WEBVIEW)
    // -------------------------------------------------------------
    const contexts = await driver.getContexts();
    const webviewContext = contexts.find(
      (context) => typeof context === 'string' && context.toUpperCase().includes('WEBVIEW')
    );

    console.log(`[Appium] 成功匹配到目标 WebView 上下文: ${webviewContext}，正在切换...`);
    await driver.switchContext(webviewContext);

    // 验证当前生效上下文已切换为 WebView
    const currentContext = await driver.getContext();
    console.log(`[Appium] 当前活跃上下文已切换至: ${currentContext}`);
    expect(currentContext.toUpperCase()).toContain('WEBVIEW');

    // -------------------------------------------------------------
    // 4. 定位前端页面中包含“登录”文本的按钮并执行断言
    // 使用 WebdriverIO 提供的 partial text 元素定位策略
    // -------------------------------------------------------------
    const loginButton = await $('button*=登录');

    // 等待按钮在页面中完全渲染并呈可见状态
    await loginButton.waitForDisplayed({
      timeout: 15000,
      timeoutMsg: '前端页面中的“登录”按钮在 15 秒内未显示'
    });

    // 执行可见性断言
    const isVisible = await loginButton.isDisplayed();
    expect(isVisible).toBe(true);
    await expect(loginButton).toBeDisplayed();

    console.log('[Appium] 成功验证前端“登录”按钮正常渲染且可见！');

    // -------------------------------------------------------------
    // 5. 测试完毕后将上下文安全切回原生 (NATIVE_APP)
    // -------------------------------------------------------------
    await driver.switchContext('NATIVE_APP');
    const finalContext = await driver.getContext();
    console.log(`[Appium] 测试完成，已安全切回原生上下文: ${finalContext}`);
  });
});
