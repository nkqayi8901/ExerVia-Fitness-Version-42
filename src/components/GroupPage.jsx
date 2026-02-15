import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

const formatRelativeTime = (value) => {
  if (!value) return "";
  try {
    const now = new Date();
    const date = new Date(value);
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
};

export default function GroupPage({ userId }) {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const storedMode = localStorage.getItem("exervia_active_mode") || "athlete";
  const communityPath =
    storedMode === "gym"
      ? `/gym/${userId || ""}/community`
      : `/athlete/${userId || ""}/community`;

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [activeChannel, setActiveChannel] = useState("general");
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef(null);

  const channels = [
    { id: "general", label: "general", icon: "#" },
    { id: "goals", label: "goals", icon: "#" },
    { id: "wins", label: "wins", icon: "#" },
    { id: "accountability", label: "accountability", icon: "#" }
  ];

  const loadProfiles = async (ids) => {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniqueIds.length) return;
    const { data } = await supabase
      .from("user_profiles")
      .select("id, display_name, username")
      .in("id", uniqueIds);
    if (!data) return;
    const mapped = {};
    data.forEach((p) => {
      mapped[p.id] = p.display_name || p.username || `User ${p.id}`;
    });
    setProfiles((prev) => ({ ...prev, ...mapped }));
  };

  useEffect(() => {
    if (!groupId || !userId) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      const [groupRes, memberRes, postRes] = await Promise.all([
        supabase.from("community_groups").select("*").eq("id", groupId).single(),
        supabase.from("community_group_members").select("*").eq("group_id", groupId),
        supabase
          .from("community_group_posts")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: true })
      ]);
      if (!mounted) return;
      setGroup(groupRes.data || null);
      setMembers(memberRes.data || []);
      setMessages(postRes.data || []);
      const allUserIds = [
        ...(memberRes.data || []).map((m) => m.user_id),
        ...(postRes.data || []).map((p) => p.created_by)
      ];
      loadProfiles(allUserIds);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_group_posts" },
        (payload) => {
          const msg = payload.new;
          if (!msg || msg.group_id !== groupId) return;
          setMessages((prev) => [...prev, msg]);
          if (msg.created_by) loadProfiles([msg.created_by]);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [groupId, userId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || !groupId || !userId) return;
    const { error } = await supabase.from("community_group_posts").insert([
      {
        group_id: groupId,
        body: draft.trim(),
        created_by: userId
      }
    ]);
    if (!error) setDraft("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onlineMembers = members.length;
  const ownerIds = members.filter((m) => m.role === "owner").map((m) => m.user_id);

  const getInitial = (name) => {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
  };

  const getAvatarColor = (id) => {
    const colors = [
      "#5865F2", "#57F287", "#FEE75C", "#EB459E", "#ED4245",
      "#3BA55D", "#FAA61A", "#E67E22", "#9B59B6", "#1ABC9C"
    ];
    const num = typeof id === "number" ? id : parseInt(id, 10) || 0;
    return colors[num % colors.length];
  };

  if (loading) {
    return (
      <div className="group-page-shell">
        <div className="group-page-loading">Loading group...</div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="group-page-shell">
        <div className="group-page-loading">
          Group not found.
          <button className="hud-secondary-btn" onClick={() => navigate(communityPath)}>
            Back to Community
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group-page-shell">
      {/* Left sidebar - channels */}
      <aside className="group-page-sidebar">
        <div className="group-page-server-header">
          <div className="group-page-server-name">{group.name}</div>
          <div className="group-page-server-goal">{group.goal || "No goal set"}</div>
        </div>

        <div className="group-page-channel-section">
          <div className="group-page-channel-label">TEXT CHANNELS</div>
          {channels.map((ch) => (
            <button
              key={ch.id}
              className={`group-page-channel ${activeChannel === ch.id ? "active" : ""}`}
              onClick={() => setActiveChannel(ch.id)}
              type="button"
            >
              <span className="group-page-channel-hash">{ch.icon}</span>
              <span>{ch.label}</span>
            </button>
          ))}
        </div>

        <div className="group-page-channel-section">
          <div className="group-page-channel-label">INFO</div>
          <div className="group-page-info-row">
            <span className="group-page-info-dim">Privacy</span>
            <span>{group.privacy || "open"}</span>
          </div>
          <div className="group-page-info-row">
            <span className="group-page-info-dim">Members</span>
            <span>{members.length}</span>
          </div>
        </div>

        <button
          className="group-page-back-btn"
          onClick={() => navigate(communityPath)}
          type="button"
        >
          Back to Community
        </button>
      </aside>

      {/* Main chat area */}
      <main className="group-page-main">
        <div className="group-page-chat-header">
          <span className="group-page-chat-hash">#</span>
          <span className="group-page-chat-channel-name">{activeChannel}</span>
          <span className="group-page-chat-topic">
            {activeChannel === "general" && "Talk about anything with your crew"}
            {activeChannel === "goals" && "Share and track your goals"}
            {activeChannel === "wins" && "Celebrate your victories"}
            {activeChannel === "accountability" && "Hold each other accountable"}
          </span>
          <div className="group-page-chat-header-right">
            <span className="group-page-member-count">{members.length} members</span>
          </div>
        </div>

        <div className="group-page-messages">
          {messages.length === 0 && (
            <div className="group-page-welcome">
              <div className="group-page-welcome-icon">#</div>
              <div className="group-page-welcome-title">
                Welcome to #{activeChannel}!
              </div>
              <div className="group-page-welcome-sub">
                This is the start of the #{activeChannel} channel in {group.name}.
              </div>
            </div>
          )}
          {messages.map((msg, i) => {
            const authorName = profiles[msg.created_by] || `User ${msg.created_by}`;
            const prevMsg = messages[i - 1];
            const showHeader =
              !prevMsg ||
              prevMsg.created_by !== msg.created_by ||
              new Date(msg.created_at) - new Date(prevMsg.created_at) > 300000;

            return (
              <div
                key={msg.id}
                className={`group-page-msg ${showHeader ? "" : "group-page-msg-compact"}`}
              >
                {showHeader ? (
                  <>
                    <div
                      className="group-page-msg-avatar"
                      style={{ background: getAvatarColor(msg.created_by) }}
                    >
                      {getInitial(authorName)}
                    </div>
                    <div className="group-page-msg-content">
                      <div className="group-page-msg-header">
                        <span
                          className="group-page-msg-author"
                          style={{ color: getAvatarColor(msg.created_by) }}
                        >
                          {authorName}
                        </span>
                        {ownerIds.includes(msg.created_by) && (
                          <span className="group-page-msg-role">OWNER</span>
                        )}
                        <span className="group-page-msg-time">
                          {formatRelativeTime(msg.created_at)}
                        </span>
                      </div>
                      <div className="group-page-msg-body">{msg.body}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="group-page-msg-gutter">
                      <span className="group-page-msg-time-hover">
                        {formatRelativeTime(msg.created_at)}
                      </span>
                    </div>
                    <div className="group-page-msg-content">
                      <div className="group-page-msg-body">{msg.body}</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        <div className="group-page-composer">
          <input
            className="group-page-composer-input"
            placeholder={`Message #${activeChannel}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="group-page-composer-send"
            onClick={handleSend}
            disabled={!draft.trim()}
            type="button"
          >
            Send
          </button>
        </div>
      </main>

      {/* Right sidebar - members */}
      <aside className="group-page-members">
        <div className="group-page-members-title">MEMBERS — {members.length}</div>
        <div className="group-page-members-section">
          {ownerIds.length > 0 && (
            <>
              <div className="group-page-members-label">
                Owner — {ownerIds.length}
              </div>
              {members
                .filter((m) => m.role === "owner")
                .map((m) => {
                  const name = profiles[m.user_id] || `User ${m.user_id}`;
                  return (
                    <div key={m.id} className="group-page-member-row">
                      <div
                        className="group-page-member-avatar"
                        style={{ background: getAvatarColor(m.user_id) }}
                      >
                        {getInitial(name)}
                      </div>
                      <div className="group-page-member-name">{name}</div>
                      <span className="group-page-member-badge">OWNER</span>
                    </div>
                  );
                })}
            </>
          )}
          <div className="group-page-members-label">
            Members — {members.filter((m) => m.role !== "owner").length}
          </div>
          {members
            .filter((m) => m.role !== "owner")
            .map((m) => {
              const name = profiles[m.user_id] || `User ${m.user_id}`;
              return (
                <div key={m.id} className="group-page-member-row">
                  <div
                    className="group-page-member-avatar"
                    style={{ background: getAvatarColor(m.user_id) }}
                  >
                    {getInitial(name)}
                  </div>
                  <div className="group-page-member-name">{name}</div>
                </div>
              );
            })}
          {members.length === 0 && (
            <div className="group-page-empty">No members yet.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
