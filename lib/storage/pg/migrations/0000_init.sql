CREATE SCHEMA "agent_chat";
--> statement-breakpoint
CREATE TABLE "agent_chat"."agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cwd" text NOT NULL,
	"always_on" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"extra_args" text,
	"settings" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_chat"."conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"title" text NOT NULL,
	"claude_session_id" text,
	"activity" text,
	"archived" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_chat"."messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript" text,
	"status" text NOT NULL,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"retried_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_chat"."push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_chat"."conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agent_chat"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "agent_chat"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_agent_idx" ON "agent_chat"."conversations" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "agent_chat"."messages" USING btree ("conversation_id","created_at");