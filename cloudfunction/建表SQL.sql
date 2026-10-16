-- TEDxSSES Youth · RIPPLE 订单表
-- 用法：云开发控制台 → SQL 型数据库 → SQL 编辑器，角色选「管理员」，把这一整段粘贴进去，点「执行」。只需要执行一次。
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  token         TEXT NOT NULL,
  ticket_id     TEXT NOT NULL,
  ticket_name   TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  qty           INTEGER NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  name          TEXT NOT NULL,
  cls           TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL,
  method        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL,
  claimed_at    BIGINT,
  confirmed_at  BIGINT,
  checked_in_at BIGINT
);
CREATE INDEX IF NOT EXISTS orders_phone_status_idx ON orders (phone, status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
-- 云函数（service_role 角色）读写这张表的权限
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO service_role;
-- 订单里有手机号：打开行级权限，网页上的公开 Key 读不到，只有云函数能读写
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
