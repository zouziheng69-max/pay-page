# TEDxSSES Youth · RIPPLE 购票页

纯静态网页，不需要服务器程序。双击 index.html 即可预览。

## 你需要做的
1. 把微信收款码图片命名为 `wechat-qr.jpg`，支付宝收款码命名为 `alipay-qr.jpg`，放进本文件夹（和 index.html 同级）
2. 用文本编辑器打开 index.html，搜索「配置区」，改票价、联系方式

## 修改源码
样式和文字在 `src/template.html`（字体已单独内嵌），改完运行 `python3 build.py` 重新生成 index.html。
直接改 index.html 也可以，只是 build 会覆盖它。

## 上线（不用 VPN 就能打开）
把 index.html 和两张收款码图片上传到任意国内可访问的静态托管或香港服务器即可。
