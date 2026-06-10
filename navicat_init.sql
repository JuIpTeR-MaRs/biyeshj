-- =========================================================
-- Guardian 智能监护银行系统 - 数据库部署与初始化脚本
-- 适用于 MySQL 5.7+ / 8.0+
-- =========================================================

-- 1. 创建并选择数据库
CREATE DATABASE IF NOT EXISTS `guardian_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `guardian_db`;

-- 2. 启用外键约束
SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 表结构部署
-- =========================================================

-- 2.1 创件交易流水记录表 (双重记账：链下明细表)
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `ward_address` varchar(42) NOT NULL COMMENT '被监护人钱包地址',
  `amount` decimal(20,2) NOT NULL COMMENT '交易金额 (Wei / 元)',
  `merchant_type` varchar(100) NOT NULL COMMENT '商户/消费类别',
  `tx_hash` varchar(66) NOT NULL COMMENT '对应区块链交易哈希 (txHash)',
  `merchant_address` varchar(42) DEFAULT NULL COMMENT '收款商户钱包地址',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '流水记录创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_ward_address` (`ward_address`),
  KEY `idx_tx_hash` (`tx_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='双重记账：链下明细表';

-- 2.2 创建监护关系绑定映射表
CREATE TABLE IF NOT EXISTS `guardianship_bindings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `ward_address` varchar(42) NOT NULL COMMENT '被监护人钱包地址',
  `guardian_address` varchar(42) NOT NULL COMMENT '监护人钱包地址',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ward_guardian` (`ward_address`, `guardian_address`),
  KEY `idx_guardian` (`guardian_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='监护关系绑定关系映射表';

-- 2.3 创建被监护人消费限额阈值配置表
CREATE TABLE IF NOT EXISTS `user_thresholds` (
  `ward_address` varchar(42) NOT NULL COMMENT '被监护人钱包地址',
  `threshold_amount` decimal(20,2) NOT NULL COMMENT '大额消费警报阈值 (元)',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后修改时间',
  PRIMARY KEY (`ward_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='被监护人消费限额阈值配置表';

-- =========================================================
-- 测试 Demo 种子数据初始化 (Seed Data)
-- 说明：导入这些测试数据后，当合约重新部署时，系统会自动将这些配置和流水恢复写入区块链。
-- =========================================================

-- 3.1 预置默认监护关系：
-- 张三（被监护人：0x70997970C51812dc3A010C7d01b50e0d17dc79C8） 绑定 
-- 李四（监护人：0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC）
INSERT INTO `guardianship_bindings` (`id`, `ward_address`, `guardian_address`) VALUES
(1, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')
ON DUPLICATE KEY UPDATE `guardian_address` = VALUES(`guardian_address`);

-- 3.2 预置默认消费阈值：
-- 将张三（被监护人）的智能预警消费阈值设定为 800.00 元
INSERT INTO `user_thresholds` (`ward_address`, `threshold_amount`) VALUES
('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 800.00)
ON DUPLICATE KEY UPDATE `threshold_amount` = VALUES(`threshold_amount`);

-- 3.3 预置默认消费流水历史记录：
-- 包含 5 笔小额消费（自动允许）与 5 笔大额消费（触发审批预警）
INSERT INTO `transactions` (`id`, `ward_address`, `amount`, `merchant_type`, `tx_hash`) VALUES
(1, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 200.00, '早餐 #1', '0xbe20271cc6132dd933fa9d5b8dd613b9a33c078a3f1c779cafcf37c004c4ab25'),
(2, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 300.00, '早餐 #2', '0xfdf3348ef5deffc989883c4070cb0234d2f5a2397097f789ac5e75bfad2cdebb'),
(3, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 400.00, '早餐 #3', '0xf912fdcbe3fd7896e8a60d0f307aa2cd6e8ea99769a862ac9cf3568c16ce73b5'),
(4, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 500.00, '早餐 #4', '0xa5c3211e9bae277dceaec6861b86c1fbfb6dce041cf87bd3bb08523577f1f4d2'),
(5, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 600.00, '早餐 #5', '0xe6018a3b8a7d6919cc52abb07c6e09bfe72101adf234b8c6a3771ae29c40c7e2'),
(6, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 1600.00, '数码产品 #1', '0xb0062fde526a432bcbee172e9eea087226124e919123a8cd6518794e8ea3f994'),
(7, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 1700.00, '数码产品 #2', '0xf73e013661394c9f66ddfd58715905d2fe63602f8877cd1bf06a970a134596d5'),
(8, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 1800.00, '数码产品 #3', '0x3eeb8aa004cd759605964f2ea45256fb51e9683f02d1e3c6cb2face26db4056f'),
(9, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 1900.00, '数码产品 #4', '0x6dc1cc6af9cbfc6d02d56b5c20e3f6255900501693ea60008ade5a605ade03c2'),
(10, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 2000.00, '数码产品 #5', '0x7adee20ee85b0664cf90aa3fd09ae9f93d81d21d702a149324d88aa753062cd0')
ON DUPLICATE KEY UPDATE `amount` = VALUES(`amount`), `merchant_type` = VALUES(`merchant_type`), `tx_hash` = VALUES(`tx_hash`);
