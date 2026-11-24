"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtEstMin, postLinkLabel } from "@/lib/hikes";

export function HikeDetailCard({ hike, getPostType, onClose }) {
  if (!hike) return null;

  return (
    <Card size="sm" className="border-primary/40 bg-card">
      <CardHeader>
        <CardDescription>
          {hike.hike_date} · {hike.year} 年第 {hike.week} 週
        </CardDescription>
        <CardTitle>{hike.route}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="關閉路線詳細資料"
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        <p className="text-sm text-foreground">
          集合點：{hike.meeting_point || "—"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">
            {hike.distance_km
              ? `距離 約 ${hike.distance_km} 公里（估算）`
              : "距離 —"}
          </Badge>
          <Badge variant="secondary">
            時間 {fmtEstMin(hike.est_duration_min)}（估算）
          </Badge>
          <Badge variant="outline">
            實際時間：
            {hike.actual_duration_min
              ? fmtEstMin(hike.actual_duration_min)
              : "待回報"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {hike.estimate_note
            ? hike.estimate_note
            : "距離與時間為路線估算，非實測；實際時間待回報。"}
        </p>
        {Array.isArray(hike.post_ids) && hike.post_ids.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {hike.post_ids.map((pid, i) => (
              <Button key={pid} variant="outline" size="sm" asChild>
                <a
                  href={`https://www.facebook.com/775427925912036/posts/${pid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {postLinkLabel(getPostType(pid), i, hike.post_ids.length)}
                </a>
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
