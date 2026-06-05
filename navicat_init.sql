-- Navicat 初始化脚本
-- 用于创建 Guardian 监护系统的数据库和表

-- 1. 创建数据库
CREATE DATABASE IF NOT EXISTS `guardian_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `guardian_db`;

-- 2. 创建交易记录表
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `ward_address` varchar(42) NOT NULL COMMENT '被监护人钱包地址',
  `amount` decimal(20,2) NOT NULL COMMENT '交易金额',
  `merchant_type` varchar(100) NOT NULL COMMENT '商户/消费类型',
  `tx_hash` varchar(66) NOT NULL COMMENT '区块链交易哈希 (txHash)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_ward_address` (`ward_address`),
  KEY `idx_tx_hash` (`tx_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='双重记账：链下交易记录表';

-- 3. 创建监护关系绑定表
CREATE TABLE IF NOT EXISTS `guardianship_bindings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `ward_address` varchar(42) NOT NULL COMMENT '被监护人钱包地址',
  `guardian_address` varchar(42) NOT NULL COMMENT '监护人钱包地址',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ward` (`ward_address`),
  KEY `idx_guardian` (`guardian_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='监护关系绑定表';

-- 4. 创建消费阈值配置表
CREATE TABLE IF NOT EXISTS `user_thresholds` (
  `ward_address` varchar(42) NOT NULL COMMENT '被监护人钱包地址',
  `threshold_amount` decimal(20,2) NOT NULL COMMENT '消费阈值',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ward_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户消费阈值配置表';
