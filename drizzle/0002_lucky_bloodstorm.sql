CREATE TABLE `job_execution_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`job_id` varchar(64) NOT NULL,
	`idempotency_key` varchar(64) NOT NULL,
	`queue_name` varchar(100) NOT NULL,
	`job_type` varchar(100) NOT NULL,
	`status` enum('started','completed','failed','skipped','expired') NOT NULL,
	`payload_hash` varchar(64),
	`result_json` text,
	`error_json` text,
	`trace_id` varchar(32),
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`failed_at` timestamp,
	`execution_time_ms` int,
	`attempts` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_execution_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_execution_log_tenant_idempotency_idx` UNIQUE(`tenant_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `job_execution_log_tenant_id_idx` ON `job_execution_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `job_execution_log_job_id_idx` ON `job_execution_log` (`job_id`);--> statement-breakpoint
CREATE INDEX `job_execution_log_tenant_status_idx` ON `job_execution_log` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `job_execution_log_queue_status_idx` ON `job_execution_log` (`queue_name`,`status`);--> statement-breakpoint
CREATE INDEX `job_execution_log_job_type_status_idx` ON `job_execution_log` (`job_type`,`status`);--> statement-breakpoint
CREATE INDEX `job_execution_log_created_at_idx` ON `job_execution_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `job_execution_log_trace_id_idx` ON `job_execution_log` (`trace_id`);