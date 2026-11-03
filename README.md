# TEDxSSES Youth · RIPPLE 涟漪 — 购票 / 预约网站

线上地址：https://tedxssesyouth.site

## 界面预览

截图来自网站的预览模式，里面的姓名、手机号、订单号都是示例数据。

### 出票动画

付款被确认后，电子票从出票口弹出，按住票根往下拉可以撕开，盖上「ISSUED」印章。

<p align="center"><img src="screenshots/ticket-animation.gif" width="280"></p>

### 电脑端

<img src="screenshots/08-desktop-home.jpg" width="820">

<img src="screenshots/09-desktop-tickets.jpg" width="820">

### 首页（手机端）

| 封面 | 活动主题 | 演讲嘉宾海报 | 活动信息与入场时间 |
| :---: | :---: | :---: | :---: |
| <img src="screenshots/01-home.png" width="200"> | <img src="screenshots/10-theme.png" width="200"> | <img src="screenshots/11-posters.jpg" width="200"> | <img src="screenshots/12-info.png" width="200"> |

### 三种身份

| 校外人士 · 68 元购票 | 本校学生 · 免费预约 | 本校老师 · 免费预约 |
| :---: | :---: | :---: |
| <img src="screenshots/02-guest.png" width="240"> | <img src="screenshots/03-student.png" width="240"> | <img src="screenshots/13-teacher.png" width="240"> |

### 付款与出票

| 付款页（订单号 + 备注核对） | 已提交，等待主办方确认 | 撕开票根后的电子票 |
| :---: | :---: | :---: |
| <img src="screenshots/04-pay.png" width="240"> | <img src="screenshots/14-waiting.png" width="240"> | <img src="screenshots/16-ticket-torn.png" width="240"> |

| 电子票（校外） | 电子票（校内免费预约） |
| :---: | :---: |
| <img src="screenshots/05-ticket.png" width="240"> | <img src="screenshots/06-free-done.png" width="240"> |

### 管理页

主办方在这里核对收款、确认订单、入场核验、作废、导出表格和清空记录。

| 电脑端：全部订单 | 手机端：待确认订单 |
| :---: | :---: |
| <img src="screenshots/15-admin-all.png" width="460"> | <img src="screenshots/07-admin.png" width="240"> |

## 目录

| 路径 | 内容 |
| --- | --- |
| `index.html` | 购票页：校外人士购票（68 元）、本校学生 / 老师免费预约 |
| `pay.html` | 付款页 + 出票动画 |
| `admin.html` | 管理页：确认收款、入场核验、作废、导出、清空记录 |
| `config.js` | 活动信息、票种、接口地址 |
| `demo.js` | 本地预览模式（双击打开网页时自动启用，不连腾讯云） |
| `cloudfunction/` | 云函数 `tedx` 的代码和数据库建表语句 |
| `qr/` | 购票页二维码 |
| `screenshots/` | README 里的界面截图 |
| `tedx-site 2/` | 早期版本，已不再使用 |

## 部署

- **网站**：把根目录下的网页文件打成 zip，上传到云开发「静态网站托管」，部署路径 `/`。
  现在部署在新加坡环境 `tedx-sg`，自定义域名 `tedxssesyouth.site`。
- **云函数**：把 `cloudfunction/index.js` 和 `cloudfunction/package.json` 打成 zip，上传到上海环境 `tedx` 的云函数 `tedx`，并选择自动安装依赖。
- **数据库**：上海环境的 PostgreSQL，在 SQL 编辑器里运行一次 `cloudfunction/建表SQL.sql`。

## 云函数环境变量（只填在云函数里，不要写进代码或网页）

- `ADMIN_KEY`：管理页登录密码
- `CLOUDBASE_API_KEY`：云开发 API Key，云函数用它读写数据库
- `PURGE_KEY`：清空所有记录时要输入的密码（可选，不填则使用代码里的默认值）

## 修改票价 / 票种

`config.js` 里的 `tickets` 和 `cloudfunction/index.js` 顶部的 `TICKETS` 要一起改，两边保持一致。
