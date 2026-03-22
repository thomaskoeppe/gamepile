"use client";

import { Bell, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationType = "success" | "error" | "info";

type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: number;
};

type NotificationInput = {
  title: string;
  message: string;
  type?: NotificationType;
  durationMs?: number;
};

type NotificationsContextValue = {
  notify: (input: NotificationInput) => string;
  clear: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function notificationTypeConfig(type: NotificationType) {
  switch (type) {
    case "success":
      return {
        icon: CheckCircle2,
        chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
      };
    case "error":
      return {
        icon: ShieldAlert,
        chip: "border-destructive/50 bg-destructive/15 text-destructive",
      };
    default:
      return {
        icon: Info,
        chip: "border-primary/40 bg-primary/15 text-primary",
      };
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clear = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));

    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    ({ title, message, type = "info", durationMs = 4500 }: NotificationInput) => {
      const id = crypto.randomUUID();

      setNotifications((current) => [
        {
          id,
          title,
          message,
          type,
          createdAt: Date.now(),
        },
        ...current,
      ].slice(0, 12));

      const timer = setTimeout(() => {
        clear(id);
      }, durationMs);

      timersRef.current.set(id, timer);
      return id;
    },
    [clear],
  );

  const contextValue = useMemo(
    () => ({
      notify,
      clear,
    }),
    [clear, notify],
  );

  return (
    <NotificationsContext.Provider value={contextValue}>
      {children}

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-85 flex-col items-end gap-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/70 bg-card/90 p-1 shadow-lg backdrop-blur-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((current) => !current)}
            className="rounded-full px-3"
          >
            <Bell className="size-4" />
            Activity
          </Button>
          {notifications.length > 0 ? (
            <span className="mr-2 inline-flex min-w-6 items-center justify-center rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              {notifications.length}
            </span>
          ) : null}
        </div>

        {open ? (
          <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <p className="text-sm font-medium text-foreground">Recent activity</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>

            <div className="max-h-[50vh] overflow-auto p-3">
              {notifications.length === 0 ? (
                <p className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                  No notifications yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notification) => {
                    const typeConfig = notificationTypeConfig(notification.type);
                    const Icon = typeConfig.icon;

                    return (
                      <article
                        key={notification.id}
                        className="animate-in fade-in slide-in-from-right-4 rounded-xl border border-border/70 bg-background/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                typeConfig.chip,
                              )}
                            >
                              <Icon className="size-3" />
                              {notification.type}
                            </span>
                            <p className="text-sm font-medium text-foreground">{notification.title}</p>
                            <p className="text-xs text-muted-foreground">{notification.message}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => clear(notification.id)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }

  return context;
}


