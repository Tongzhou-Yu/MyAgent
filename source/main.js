const { app, BrowserWindow, BrowserView, ipcMain, screen, session } = require('electron');
require('@electron/remote/main').initialize();
const path = require('path');
const fs = require('fs');

// 禁用Electron安全警告
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let mainWindow;
let currentView;
let isMinimized = false;
let currentService = 'deepseek';
// 为每个服务设置固定的默认缩放比例
const DEFAULT_ZOOM = 1.0;
// 当前会话的缩放比例，所有服务共享
let currentSessionZoom = DEFAULT_ZOOM;

// 应用启动时直接创建窗口
app.whenReady().then(() => {
    // 设置应用数据路径，避免权限问题
    app.setPath('userData', path.join(app.getPath('documents'), 'AIAssistant'));

    createWindow();
});

// 创建主窗口
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 600,
        minWidth: 320,
        minHeight: 240,
        frame: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            // 禁用硬件加速，可能减少某些图形相关错误
            enableHardwareAcceleration: false,
            // 禁用同源策略，避免某些网站的跨域问题
            webSecurity: false,
            // 禁用沙箱
            sandbox: false
        }
    });

    // 允许在渲染进程中使用remote
    require('@electron/remote/main').enable(mainWindow.webContents);

    // 加载主界面
    mainWindow.loadFile('index.html');

    // 创建视图
    switchView(currentService);

    // 设置窗口大小变化监听器
    setupWindowResizeListener();

    // 监听窗口关闭事件
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 设置全局函数，供渲染进程调用
    global.toggleMinimize = toggleMinimize;
    global.setZoom = setZoom;
    global.switchView = switchView;
}

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 当应用被激活时，如果没有窗口则创建窗口
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// 切换最小化状态
function toggleMinimize() {
    isMinimized = !isMinimized;

    // 通知渲染进程窗口状态变化
    mainWindow.webContents.send('window-state-change', { isMinimized });

    if (isMinimized) {
        // 最小化模式：调整窗口大小
        const display = screen.getPrimaryDisplay();
        const { width } = display.workAreaSize;

        mainWindow.setSize(400, 36);
        mainWindow.setPosition(width - 400, 0);
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setResizable(false);
    } else {
        // 恢复正常模式
        mainWindow.setSize(400, 600);
        mainWindow.center();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setResizable(true);

        // 更新视图大小
        setTimeout(() => updateViewBounds(), 100);
    }
}

// 设置缩放比例
function setZoom(factor) {
    if (currentView) {
        try {
            // 更新当前会话的缩放比例
            currentSessionZoom = factor;
            currentView.webContents.setZoomFactor(factor);

            // 通知渲染进程缩放比例已更新
            mainWindow.webContents.send('zoom-changed', { zoomFactor: factor });
        } catch (error) {
            console.error('设置缩放比例失败:', error);
        }
    }
}

// 切换视图
function switchView(service) {
    try {
        // 保存当前服务
        currentService = service;

        // 如果已经有视图，先销毁
        if (currentView) {
            mainWindow.removeBrowserView(currentView);
            currentView = null;
        }

        // 创建新视图
        currentView = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                // 为每个服务使用独立的会话
                partition: `persist:${service}`
            }
        });

        mainWindow.addBrowserView(currentView);

        // 设置视图大小
        updateViewBounds();

        // 加载对应服务的URL
        let url;
        switch (service) {
            case 'deepseek':
                url = 'https://chat.deepseek.com/';
                break;
            case 'kimi':
                url = 'https://kimi.moonshot.cn/';
                break;
            case 'mita':
                url = 'https://metaso.cn/';
                break;
            default:
                url = 'https://chat.deepseek.com/';
        }

        // 加载URL
        currentView.webContents.loadURL(url);

        // 使用当前会话的缩放比例
        currentView.webContents.setZoomFactor(currentSessionZoom);

        // 通知渲染进程标签变化
        mainWindow.webContents.send('tab-changed', { service, zoomFactor: currentSessionZoom });

        // 监听视图加载完成事件
        currentView.webContents.on('did-finish-load', () => {
            // 重新设置缩放比例，确保加载后缩放正确
            currentView.webContents.setZoomFactor(currentSessionZoom);
        });

        console.log('Switching to service:', service);
    } catch (error) {
        console.error('切换视图失败:', error);
    }
}

// 更新视图大小
function updateViewBounds() {
    if (currentView && mainWindow) {
        const contentBounds = mainWindow.getContentBounds();
        const contentHeight = contentBounds.height - 36 - 28; // 减去标题栏和底部控制栏的高度

        currentView.setBounds({
            x: 0,
            y: 36, // 标题栏高度
            width: contentBounds.width,
            height: contentHeight
        });
    }
}

// 监听窗口大小变化事件
function setupWindowResizeListener() {
    if (mainWindow) {
        mainWindow.on('resize', () => {
            updateViewBounds();
        });
    }
} 