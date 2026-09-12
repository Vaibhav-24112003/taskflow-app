-- ─────────────────────────────────────────────────────────────────
-- TaskFlowCo: Remove Zoho Books integration
-- Migration: 20260912_drop_zoho_columns.sql
--
-- The org is not GST-registered, so invoicing was moved off Zoho Books
-- entirely: payments (Razorpay) and invoices/receipts are now issued
-- natively by TaskFlowCo (edge function `send-invoice`, email via Resend).
-- These columns held Zoho references that are no longer written or read.
--
-- Safe ordering: deploy `send-invoice` and the updated `razorpay-webhook`
-- (which no longer touch these columns) BEFORE running this migration.
-- ─────────────────────────────────────────────────────────────────

alter table if exists subscriptions        drop column if exists zoho_customer_id;

alter table if exists payment_events        drop column if exists zoho_invoice_id;
alter table if exists payment_events        drop column if exists zoho_invoice_number;

alter table if exists subscription_invoices drop column if exists zoho_invoice_id;
alter table if exists subscription_invoices drop column if exists zoho_invoice_url;

-- Legacy invoices table (superseded by subscription_invoices) also carried
-- Zoho columns — drop them if the table still exists.
alter table if exists invoices              drop column if exists zoho_invoice_id;
alter table if exists invoices              drop column if exists zoho_invoice_url;
