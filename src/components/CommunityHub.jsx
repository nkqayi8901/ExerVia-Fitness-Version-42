// Below we import React hooks used throughout this component:
// useState manages local UI state (tabs, modals, forms, loaded data),
// useEffect runs side effects like fetching data + realtime subscriptions,
// useMemo memoises expensive derived values (filtering + sorting lists).
import { useEffect, useMemo, useState } from "react";
// adapted from https://reactrouter.com/en/main/hooks/use-navigate
// useNavigate is used for client-side navigation
import { useNavigate } from "react-router-dom";
// supabase client is imported to interact with our backend for data fetching and mutations
import { supabase } from "../supabaseClient";
// Component: CommunityHub - UI layout and interactions.
// This component renders the communityhub experience and wires up its local UI state.
// Sections below are grouped to keep the layout and user flow readable.
// Comment blocks explain intent without changing behavior.

// This is the main Community Hub component 
// which serves as the central place for all community interactions
const forumTracks = [
  { id: "hyrox", title: "Hyrox", subtitle: "Race prep, stations, engine" },
  { id: "running", title: "Running", subtitle: "Tempo, pacing, endurance" },
  { id: "nutrition", title: "Nutrition", subtitle: "Fueling, recovery, habits" },
  { id: "strength", title: "Strength", subtitle: "Progressions, form, PRs" },
  { id: "mindset", title: "Mindset", subtitle: "Consistency, discipline, recovery" }
];
// communitySections defines the different sections of the community hub, 
// currently only groups but can be expanded to include more like challenges, events, etc.
const communitySections = [
  {
    id: "groups",
    title: "Accountability Groups",
    sub: "Small crews with shared goals.",
    cta: "Create group"
  }
];
// reactionOptions defines the different reactions users can give to posts and replies
const reactionOptions = [
  { id: "like", label: "Like" },
  { id: "fire", label: "Fire" },
  { id: "insight", label: "Insight" }
];

// formatTime manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
const formatTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
};
// buildReplyTree takes a flat list of replies and organizes 
// them into a nested tree structure based on parent-child relationships
const buildReplyTree = (replies) => {
  if (!replies?.length) return [];
  const map = {};
  replies.forEach((reply) => {
    map[reply.id] = { ...reply, children: [] };
  });
  const roots = [];
  replies.forEach((reply) => {
    const node = map[reply.id];
    if (reply.parent_id && map[reply.parent_id]) {
      map[reply.parent_id].children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};
// CommunityHub is the main component for the community section of the app,
// it manages state for forums, groups, challenges, posts, replies, friends, and more,
// it also handles all interactions like creating posts, joining groups, adding friends, etc.
// The UI is organized into tabs for forums, groups, challenges, and friends,
// with modals for creating new content and managing interactions.
// The component also sets up realtime subscriptions to update the UI in response to new posts,
// replies, and messages without needing a page refresh.
export default function CommunityHub({ userId }) {
  const navigate = useNavigate();
  const storedMode = localStorage.getItem("exervia_active_mode") || "athlete";
  const backPath = storedMode === "gym" ? `/gym/${userId || ""}` : `/athlete/${userId || ""}`;
  const [activeTab, setActiveTab] = useState("forums");
  const [activeForum, setActiveForum] = useState("hyrox");
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [search, setSearch] = useState("");
  const [forums, setForums] = useState([]);
  const [groups, setGroups] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);
  const [groupPosts, setGroupPosts] = useState([]);
  const [postReplies, setPostReplies] = useState({});
  const [profiles, setProfiles] = useState({});
  const [friendStats, setFriendStats] = useState({});
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [friendMessages, setFriendMessages] = useState([]);
  const [friendMessageDraft, setFriendMessageDraft] = useState("");
  const [friendLastSeen, setFriendLastSeen] = useState({});
  const [friendLatest, setFriendLatest] = useState({});
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [threadSort, setThreadSort] = useState("newest");
  const [collapsedThreads, setCollapsedThreads] = useState({});
  const [memberships, setMemberships] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");
// below are state variables to manage the open/close state of various modals for 
// creating groups, challenges, posts, replies, and adding friends
// there are also state variables to hold the form data for these modals, as well as
// state for reaction counts and user reactions on posts and replies
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createChallengeOpen, setCreateChallengeOpen] = useState(false);
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [createGroupPostOpen, setCreateGroupPostOpen] = useState(false);
  const [createReplyOpen, setCreateReplyOpen] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);

  const [newGroup, setNewGroup] = useState({ name: "", goal: "", privacy: "invite" });
  const [newChallenge, setNewChallenge] = useState({
    title: "",
    type: "distance",
    target: "",
    durationDays: "7"
  });
  const [newPost, setNewPost] = useState({ title: "", body: "" });
  const [newPostForum, setNewPostForum] = useState(activeForum);
  const [newGroupPost, setNewGroupPost] = useState({ body: "" });
  const [newReply, setNewReply] = useState({ body: "", parentId: null });
  const [reactionCounts, setReactionCounts] = useState({});
  const [userReactions, setUserReactions] = useState({});
  const [newFriendId, setNewFriendId] = useState("");
// loadProfiles takes a list of user ids and fetches their profiles from the backend,
// it then maps the profiles into a dictionary for easy lookup when displaying posts, 
// replies, and friends
// loadFriendStats is similar but it fetches the rank and level of friends to display 
// in the friend list
  const loadProfiles = async (ids) => {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniqueIds.length) return;
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, display_name, username")
      .in("id", uniqueIds);
    if (error || !data) return;
    const mapped = {};
    data.forEach((profile) => {
      mapped[profile.id] = profile.display_name || profile.username || profile.id;
    });
    setProfiles((prev) => ({ ...prev, ...mapped }));
  };
// loadFriendStats is similar but it fetches the rank and level of friends to display
// in the friend list, it also maps the stats into a dictionary keyed by user id for easy lookup
// when rendering the friend list and their associated stats
  const loadFriendStats = async (ids) => {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniqueIds.length) return;
    const { data, error } = await supabase
      .from("user_state")
      .select("user_id, rank, level")
      .in("user_id", uniqueIds);
    if (error || !data) return;
    const mapped = {};
    data.forEach((row) => {
      mapped[row.user_id] = { rank: row.rank, level: row.level };
    });
    setFriendStats((prev) => ({ ...prev, ...mapped }));
  };
// getFriendStatus is a helper function that takes a friend relationship row and determines
// the status of the friendship from the perspective of the current user, it returns
// "accepted" if they are friends, "outgoing" if the current user sent a request,
// "incoming" if the current user received a request, and "" if there is no relationship
// this function is used when rendering the friend list to determine what 
// actions to show for each friend
  const getFriendStatus = (friendRow) => {
    if (friendRow.status === "accepted") return "accepted";
    const currentId = Number(userId);
    const requesterId =
      friendRow.status === "pending_low" ? friendRow.user_id : friendRow.friend_user_id;
    if (currentId === requesterId) return "outgoing";
    return "incoming";
  };
// loadFriendMessageSummaries fetches the latest message for 
// each friend conversation to display
// in the friend list, and keeps the preview list fresh,
// it queries the messages table for any messages involving the current user,
// and then reduces the list to one latest message per friend
  const loadFriendMessageSummaries = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("community_friend_messages")
      .select("*")
      .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);
    const latest = {};
    (data || []).forEach((msg) => {
      const otherId = Number(msg.user_id) === Number(userId) ? msg.friend_user_id : msg.user_id;
      if (!latest[otherId]) {
        latest[otherId] = msg;
      }
    });
    setFriendLatest(latest);
  };
// loadForumPosts takes a forum slug and loads the posts for that forum from the backend,
// it also loads the profiles of the post creators and the replies to those posts,
// this function is called when the active forum changes and also when a new post is created
// to refresh the list of posts, it queries the posts table for posts in the specified forum,
// then it loads the profiles of the post creators and the replies to those posts
// to display all the relevant information when rendering the forum posts
// similar functions exist for loading group posts and group information when 
// the active group changes
// the function also handles the case where the forum data is not yet 
// loaded and uses the forumTracks as a fallback
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
// fetchCommunity manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
    const fetchCommunity = async () => {
      setLoading(true);
      setBanner("");
      await Promise.all(
        forumTracks.map((forum) =>
          supabase
            .from("community_forums")
            .upsert(
              {
                title: forum.title,
                subtitle: forum.subtitle,
                topic_slug: forum.id,
                created_by: userId
              },
              { onConflict: "topic_slug" }
            )
        )
      );
      const [forumRes, groupRes, challengeRes, membershipRes, friendRes] = await Promise.all([
        supabase.from("community_forums").select("*").order("created_at", { ascending: true }),
        supabase.from("community_groups").select("*").order("created_at", { ascending: false }),
        supabase.from("community_challenges").select("*").order("created_at", { ascending: false }),
        supabase.from("community_group_members").select("*").eq("user_id", userId),
        supabase
          .from("community_friends")
          .select("*")
          .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`)
      ]);
      if (!mounted) return;
      setForums(forumRes.data || []);
      setGroups(groupRes.data || []);
      setChallenges(challengeRes.data || []);
      setMemberships(membershipRes.data || []);
      const friendList = friendRes.data || [];
      setFriends(friendList);
      const friendIds = friendList.flatMap((row) => [row.user_id, row.friend_user_id]);
      loadProfiles(friendIds);
      loadFriendStats(friendIds);
      loadFriendMessageSummaries();
      const defaultForum = activeForum || forumTracks[0].id;
      setActiveForum(defaultForum);
      await loadForumPosts(defaultForum, forumRes.data || []);
      setLoading(false);
    };
    fetchCommunity();
    // Render
    return () => {
      mounted = false;
    };
  }, [userId]);
// below are useEffect hooks that set up realtime subscriptions to the 
// backend using Supabase's realtime features,
// the first subscription listens for new friend messages and 
// updates the friend list and message threads accordingly,
// the second subscription listens for new forum posts and replies and
//  updates the forum threads in realtime,
// these subscriptions ensure that users see new messages and posts
//  without needing to refresh the page
  useEffect(() => {
    if (!userId) return () => {};
    const channel = supabase
      .channel(`friend-messages-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_friend_messages" },
        (payload) => {
          const message = payload.new;
          const currentId = Number(userId);
          if (!message) return;
          if (Number(message.user_id) !== currentId && Number(message.friend_user_id) !== currentId) return;
          const otherId =
            Number(message.user_id) === currentId ? Number(message.friend_user_id) : Number(message.user_id);
          setFriendLatest((prev) => ({ ...prev, [otherId]: message }));
          if (Number(selectedFriendId) === otherId) {
            setFriendMessages((prev) => [...prev, message]);
            setFriendLastSeen((prev) => ({ ...prev, [otherId]: message.created_at }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, selectedFriendId]);
// the second subscription listens for new forum posts and replies,
// it keeps the thread list and reply list in sync with realtime inserts,
// this prevents users from missing new activity while they browse,
// and keeps the UI reactive without a manual refresh
  useEffect(() => {
    if (!userId) return () => {};
    const activeForumId = forums.find((forum) => forum.topic_slug === activeForum)?.id;
    const postIdSet = new Set(forumPosts.map((post) => post.id));

    const channel = supabase
      .channel(`community-forums-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_posts" },
        (payload) => {
          const post = payload.new;
          if (!post || !activeForumId) return;
          if (post.forum_id !== activeForumId) return;
          setForumPosts((prev) => [post, ...prev]);
          if (post.created_by) loadProfiles([post.created_by]);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_post_replies" },
        (payload) => {
          const reply = payload.new;
          if (!reply) return;
          if (!postIdSet.has(reply.post_id)) return;
          setPostReplies((prev) => {
            const next = { ...prev };
            const current = next[reply.post_id] || [];
            next[reply.post_id] = [...current, reply];
            return next;
          });
          if (reply.created_by) loadProfiles([reply.created_by]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, activeForum, forums, forumPosts]);

// derived forum lists and select options are memoised to avoid
// re-filtering and re-mapping on every render,
// these values update only when their dependencies change,
// and help keep scrolling + search snappy for large lists
  const filteredForums = useMemo(() => {
    const source = forums.length ? forums : forumTracks;
    if (!search) return source;
    const query = search.toLowerCase();
    return source.filter(
      (forum) =>
        (forum.title || "").toLowerCase().includes(query) ||
        (forum.subtitle || "").toLowerCase().includes(query)
    );
  }, [forums, search]);

  const forumSelectOptions = useMemo(() => {
    return forums.length ? forums : forumTracks;
  }, [forums]);

// sync the new post modal forum selector with the active forum,
// this ensures the modal always defaults to the forum the user is browsing,
// and prevents stale forum selection if the user switches tabs,
// the value resets whenever the modal closes
  useEffect(() => {
    if (!createPostOpen) {
      setNewPostForum(activeForum);
    }
  }, [activeForum, createPostOpen]);

// below are the action handlers for create/join/update flows,
// they call supabase mutations, set banner feedback,
// and refresh the relevant lists after successful operations,
// each handler also validates required fields before submitting
  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) return;
    if (!userId) {
      setBanner("Sign in to create a group.");
      return;
    }
    const { data, error } = await supabase
      .from("community_groups")
      .insert([
        {
          name: newGroup.name.trim(),
          goal: newGroup.goal.trim(),
          privacy: newGroup.privacy,
          created_by: userId
        }
      ])
      .select("*")
      .single();
    if (error) {
      setBanner(error.message || "Could not create group.");
      return;
    }
    const { error: memberError } = await supabase.from("community_group_members").insert([
      {
        group_id: data.id,
        user_id: userId,
        role: "owner"
      }
    ]);
    if (memberError) {
      setBanner(memberError.message || "Could not join group.");
    }
    setCreateGroupOpen(false);
    setNewGroup({ name: "", goal: "", privacy: "invite" });
    setBanner("Group created.");
    const { data: groupData } = await supabase
      .from("community_groups")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: membershipData } = await supabase
      .from("community_group_members")
      .select("*")
      .eq("user_id", userId);
    setGroups(groupData || []);
    setMemberships(membershipData || []);
    if (data?.id) {
      const basePath = storedMode === "gym" ? `/gym/${userId || ""}` : `/athlete/${userId || ""}`;
      navigate(`${basePath}/community/group/${data.id}`);
    }
  };

// create a new challenge tied to the current user,
// validates required fields and normalizes numeric inputs,
// then refreshes the challenges list after insert,
// and surfaces any errors via the banner
  const handleCreateChallenge = async () => {
    if (!newChallenge.title.trim()) return;
    if (!userId) {
      setBanner("Sign in to create a challenge.");
      return;
    }
    const { error } = await supabase.from("community_challenges").insert([
      {
        title: newChallenge.title.trim(),
        type: newChallenge.type,
        target_value: newChallenge.target ? Number(newChallenge.target) : null,
        duration_days: newChallenge.durationDays ? Number(newChallenge.durationDays) : 7,
        created_by: userId
      }
    ]);
    if (error) {
      setBanner(error.message || "Could not create challenge.");
      return;
    }
    setCreateChallengeOpen(false);
    setNewChallenge({ title: "", type: "distance", target: "", durationDays: "7" });
    setBanner("Challenge created.");
    const { data } = await supabase
      .from("community_challenges")
      .select("*")
      .order("created_at", { ascending: false });
    setChallenges(data || []);
  };

// create a new forum post for the selected forum,
// resolves the forum id from the current slug selection,
// prevents posting if the forum or user is missing,
// then refreshes the active forum feed after success
  const handleCreatePost = async () => {
    if (!newPost.title.trim()) return;
    const forumSlug = newPostForum || activeForum;
    let forumId = forums.find((forum) => forum.topic_slug === forumSlug)?.id;
    if (!forumId && forumSlug) {
      const { data } = await supabase
        .from("community_forums")
        .select("id")
        .eq("topic_slug", forumSlug)
        .single();
      forumId = data?.id || null;
    }
    if (!forumId) {
      setBanner("Select a forum to post in.");
      return;
    }
    if (!userId) {
      setBanner("Sign in to post.");
      return;
    }
    const { error } = await supabase.from("community_posts").insert([
      {
        forum_id: forumId,
        title: newPost.title.trim(),
        body: newPost.body.trim(),
        created_by: userId
      }
    ]);
    if (error) {
      setBanner(error.message || "Could not create post.");
      return;
    }
    setCreatePostOpen(false);
    setNewPost({ title: "", body: "" });
    setNewPostForum(forumSlug);
    setBanner("Post created.");
    loadForumPosts(forumSlug);
  };

// create a reply on the active thread or parent reply,
// validates input and requires authentication,
// posts to the replies table and refreshes the thread,
// then clears the reply modal state
  const handleCreateReply = async () => {
    if (!newReply.body.trim() || !activeThreadId) return;
    if (!userId) {
      setBanner("Sign in to reply.");
      return;
    }
    const { error } = await supabase.from("community_post_replies").insert([
      {
        post_id: activeThreadId,
        parent_id: newReply.parentId,
        body: newReply.body.trim(),
        created_by: userId
      }
    ]);
    if (error) {
      setBanner(error.message || "Could not post reply.");
      return;
    }
    setCreateReplyOpen(false);
    setNewReply({ body: "", parentId: null });
    loadForumPosts(activeForum);
  };

// create a new group chat message in the active group,
// validates that a group is selected before posting,
// inserts the post and reloads the group chat list,
// then closes the modal and clears the draft
  const handleCreateGroupPost = async () => {
    if (!newGroupPost.body.trim()) return;
    if (!activeGroupId) {
      setBanner("Select a group first.");
      return;
    }
    const { error } = await supabase.from("community_group_posts").insert([
      {
        group_id: activeGroupId,
        body: newGroupPost.body.trim(),
        created_by: userId
      }
    ]);
    if (error) {
      setBanner(error.message || "Could not post in group.");
      return;
    }
    setCreateGroupPostOpen(false);
    setNewGroupPost({ body: "" });
    const { data } = await supabase
      .from("community_group_posts")
      .select("*")
      .eq("group_id", activeGroupId)
      .order("created_at", { ascending: false });
    setGroupPosts(data || []);
  };

// send a friend request by numeric user id,
// validates input, checks that the user exists,
// inserts the relationship row with ordered ids,
// then refreshes the friends list and closes the modal
  const handleAddFriend = async () => {
    if (!newFriendId.trim()) return;
    if (!userId) {
      setBanner("Sign in to add friends.");
      return;
    }
    const parsedFriendId = Number(newFriendId.trim());
    if (!Number.isInteger(parsedFriendId)) {
      setBanner("Friend id must be a valid numeric user id.");
      return;
    }
    const { data: friendProfile, error: friendLookupError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", parsedFriendId)
      .single();
    if (friendLookupError || !friendProfile) {
      setBanner("Friend id not found. Ask them for their numeric profile id.");
      return;
    }
    const orderedUserId = Math.min(Number(userId), parsedFriendId);
    const orderedFriendId = Math.max(Number(userId), parsedFriendId);
    const requesterId = Number(userId);
    const requesterIsLower = requesterId === orderedUserId;
    const { error } = await supabase.from("community_friends").insert([
      {
        user_id: orderedUserId,
        friend_user_id: orderedFriendId,
        status: requesterIsLower ? "pending_low" : "pending_high"
      }
    ]);
    if (error) {
      setBanner(error.message || "Could not add friend.");
      return;
    }
    setAddFriendOpen(false);
    setNewFriendId("");
    setBanner("Friend request sent.");
    const { data } = await supabase
      .from("community_friends")
      .select("*")
      .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`);
    setFriends(data || []);
  };

// handleJoinGroup manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
  const handleJoinGroup = async (groupId) => {
    if (!userId) {
      setBanner("Sign in to join a group.");
      return;
    }
    const { error } = await supabase.from("community_group_members").insert([
      {
        group_id: groupId,
        user_id: userId,
        role: "member"
      }
    ]);
    if (error) {
      setBanner(error.message || "Could not join group.");
      return;
    }
    setBanner("Joined group.");
    const { data: membershipData } = await supabase
      .from("community_group_members")
      .select("*")
      .eq("user_id", userId);
    setMemberships(membershipData || []);
    const basePath = storedMode === "gym" ? `/gym/${userId || ""}` : `/athlete/${userId || ""}`;
    navigate(`${basePath}/community/group/${groupId}`);
  };

// accept an incoming friend request,
// updates the relationship status in the backend,
// refreshes the friends list on success,
// and shows feedback via the banner
  const handleAcceptFriend = async (friendRow) => {
    const { error } = await supabase
      .from("community_friends")
      .update({ status: "accepted" })
      .eq("id", friendRow.id);
    if (error) {
      setBanner(error.message || "Could not accept friend.");
      return;
    }
    setBanner("Friend request accepted.");
    const { data } = await supabase
      .from("community_friends")
      .select("*")
      .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`);
    setFriends(data || []);
  };

// reject an incoming friend request,
// removes the relationship row in the backend,
// refreshes the friends list on success,
// and shows feedback via the banner
  const handleRejectFriend = async (friendRow) => {
    const { error } = await supabase
      .from("community_friends")
      .delete()
      .eq("id", friendRow.id);
    if (error) {
      setBanner(error.message || "Could not reject friend.");
      return;
    }
    setBanner("Friend request rejected.");
    const { data } = await supabase
      .from("community_friends")
      .select("*")
      .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`);
    setFriends(data || []);
  };

// build the display label for a friend row,
// resolves the "other" user id from the relationship,
// falls back to the numeric id if profile data is missing,
// used throughout the friend list and chat header
  const buildFriendLabel = (friendRow) => {
    const currentId = Number(userId);
    const otherId = friendRow.user_id === currentId ? friendRow.friend_user_id : friendRow.user_id;
    return profiles[otherId] || `User ${otherId}`;
  };

// build the small stats line for a friend row,
// uses cached rank + level from user_state,
// falls back to placeholder values if missing,
// keeps the friend list compact and readable
  const buildFriendMeta = (friendRow) => {
    const currentId = Number(userId);
    const otherId = friendRow.user_id === currentId ? friendRow.friend_user_id : friendRow.user_id;
    const stats = friendStats[otherId];
    if (!stats) return "Rank -- · Level --";
    return `Rank ${stats.rank || "--"} · Level ${stats.level ?? "--"}`;
  };

// determine whether a friend has unread messages,
// compares the latest message timestamp to last seen,
// ignores messages sent by the current user,
// used to show notification dots in the UI
  const getFriendUnread = (friendRow) => {
    const currentId = Number(userId);
    const otherId = friendRow.user_id === currentId ? friendRow.friend_user_id : friendRow.user_id;
    const latest = friendLatest[otherId];
    if (!latest) return false;
    if (Number(latest.user_id) === Number(userId)) return false;
    const lastSeen = friendLastSeen[otherId];
    if (!lastSeen) return true;
    return new Date(latest.created_at) > new Date(lastSeen);
  };

// load the full message history for a friend pair,
// orders messages oldest -> newest for chat display,
// updates the last seen timestamp to suppress unread dots,
// then refreshes the message summaries list
  const loadFriendMessages = async (friendId) => {
    if (!friendId || !userId) return;
    const currentId = Number(userId);
    const low = Math.min(currentId, friendId);
    const high = Math.max(currentId, friendId);
    const { data } = await supabase
      .from("community_friend_messages")
      .select("*")
      .or(`and(user_id.eq.${low},friend_user_id.eq.${high}),and(user_id.eq.${high},friend_user_id.eq.${low})`)
      .order("created_at", { ascending: true });
    setFriendMessages(data || []);
    const lastSeen = data?.length ? data[data.length - 1].created_at : new Date().toISOString();
    setFriendLastSeen((prev) => ({ ...prev, [friendId]: lastSeen }));
    loadFriendMessageSummaries();
  };

// send a new private message to the selected friend,
// inserts the message into the backend,
// reloads the conversation and summary list,
// and clears the draft input on success
  const handleSendFriendMessage = async () => {
    if (!friendMessageDraft.trim() || !selectedFriendId || !userId) return;
    const currentId = Number(userId);
    const otherId = Number(selectedFriendId);
    const low = Math.min(currentId, otherId);
    const high = Math.max(currentId, otherId);
    const { error } = await supabase
      .from("community_friend_messages")
      .insert([
        {
          user_id: currentId,
          friend_user_id: otherId,
          body: friendMessageDraft.trim()
        }
      ]);
    if (error) {
      setBanner(error.message || "Could not send message.");
      return;
    }
    setFriendMessageDraft("");
    loadFriendMessages(otherId);
    loadFriendMessageSummaries();
    const next = await supabase
      .from("community_friend_messages")
      .select("*")
      .or(`and(user_id.eq.${low},friend_user_id.eq.${high}),and(user_id.eq.${high},friend_user_id.eq.${low})`)
      .order("created_at", { ascending: true });
    setFriendMessages(next.data || []);
  };

// delete a forum post owned by the current user,
// validates user authentication and ownership,
// removes the post from the backend,
// then reloads the active forum feed
  const handleDeletePost = async (postId) => {
    if (!userId) return;
    const { error } = await supabase
      .from("community_posts")
      .delete()
      .eq("id", postId)
      .eq("created_by", Number(userId));
    if (error) {
      setBanner(error.message || "Could not delete post.");
      return;
    }
    setBanner("Post deleted.");
    loadForumPosts(activeForum);
  };

// delete a reply owned by the current user,
// validates user authentication and ownership,
// removes the reply from the backend,
// then reloads the active forum thread list
  const handleDeleteReply = async (replyId) => {
    if (!userId) return;
    const { error } = await supabase
      .from("community_post_replies")
      .delete()
      .eq("id", replyId)
      .eq("created_by", Number(userId));
    if (error) {
      setBanner(error.message || "Could not delete reply.");
      return;
    }
    setBanner("Reply deleted.");
    loadForumPosts(activeForum);
  };

// handleJoinChallenge manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
  const handleJoinChallenge = async (challengeId) => {
    if (!userId) {
      setBanner("Sign in to join a challenge.");
      return;
    }
    const { error } = await supabase.from("community_challenge_participants").insert([
      {
        challenge_id: challengeId,
        user_id: userId,
        progress: 0
      }
    ]);
    if (error) {
      setBanner(error.message || "Could not join challenge.");
      return;
    }
    setBanner("Challenge joined.");
  };

// load all posts for a forum slug,
// then fetch replies and reactions for those posts,
// builds lookup tables for quick render access,
// and loads author profile names for display
  const loadForumPosts = async (forumSlug, forumList = forums) => {
    const forumId = forumList.find((forum) => forum.topic_slug === forumSlug)?.id;
    if (!forumId) return;
    const { data } = await supabase
      .from("community_posts")
      .select("*")
      .eq("forum_id", forumId)
      .order("created_at", { ascending: false });
    setForumPosts(data || []);
    if (!data?.length) {
      setPostReplies({});
      setReactionCounts({});
      setUserReactions({});
      return;
    }
    const postIds = data.map((post) => post.id);
    const { data: replyData } = await supabase
      .from("community_post_replies")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });
    const grouped = {};
    (replyData || []).forEach((reply) => {
      if (!grouped[reply.post_id]) grouped[reply.post_id] = [];
      grouped[reply.post_id].push(reply);
    });
    setPostReplies(grouped);
    const authorIds = [
      ...data.map((post) => post.created_by),
      ...(replyData || []).map((reply) => reply.created_by)
    ];
    loadProfiles(authorIds);
    const { data: reactionData } = await supabase
      .from("community_reactions")
      .select("*")
      .in("post_id", postIds);
    const nextReactions = {};
    const nextUserReactions = {};
    (reactionData || []).forEach((reaction) => {
      const key = reaction.reply_id
        ? `reply:${reaction.reply_id}-${reaction.reaction}`
        : `post:${reaction.post_id}-${reaction.reaction}`;
      nextReactions[key] = (nextReactions[key] || 0) + 1;
      if (userId && reaction.user_id === userId) {
        nextUserReactions[key] = reaction.id;
      }
    });
    setReactionCounts(nextReactions);
    setUserReactions(nextUserReactions);
  };

// sort threads based on selected mode,
// newest uses post timestamps,
// top uses reply count per thread,
// active uses the latest reply activity per thread
  const sortedForumPosts = useMemo(() => {
    if (!forumPosts.length) return [];
    const copy = [...forumPosts];
    if (threadSort === "newest") {
      return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (threadSort === "top") {
      return copy.sort((a, b) => {
// aCount manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
        const aCount = (postReplies[a.id] || []).length;
// bCount manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
        const bCount = (postReplies[b.id] || []).length;
        return bCount - aCount;
      });
    }
    if (threadSort === "active") {
      return copy.sort((a, b) => {
// aLatest manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
        const aLatest = (postReplies[a.id] || []).slice(-1)[0]?.created_at || a.created_at;
// bLatest manages a focused piece of logic,
// it keeps behavior isolated for readability,
// inputs are validated before mutation when needed,
// and output feeds the UI state or data flow
        const bLatest = (postReplies[b.id] || []).slice(-1)[0]?.created_at || b.created_at;
        return new Date(bLatest) - new Date(aLatest);
      });
    }
    return copy;
  }, [forumPosts, postReplies, threadSort]);

// compute unread count for all friends,
// uses latest message + last seen logic per friend,
// keeps the badge count in sync with realtime updates,
// recalculates when message or friend state changes
  const unreadCount = useMemo(() => {
    return friends.reduce((count, friend) => (getFriendUnread(friend) ? count + 1 : count), 0);
  }, [friends, friendLatest, friendLastSeen, userId]);

// build the "Thread Pulse" list (top 5 active threads),
// counts replies per thread and sorts descending,
// used in the sidebar for quick navigation,
// recalculates when posts or replies change
  const threadPulse = useMemo(() => {
    if (!forumPosts.length) return [];
    return [...forumPosts]
      .map((post) => ({
        post,
        count: (postReplies[post.id] || []).length
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [forumPosts, postReplies]);

// determine the most active thread id,
// used to display the "Most active" badge,
// falls back to null if there are no threads,
// recalculates when threadPulse changes
  const mostActiveId = useMemo(() => {
    if (!threadPulse.length) return null;
    return threadPulse[0].post.id;
  }, [threadPulse]);

// toggle collapsed state for a thread,
// keeps the UI compact when threads get long,
// stores collapsed flags by post id,
// allows per-thread expand/collapse
  const toggleCollapse = (postId) => {
    setCollapsedThreads((prev) => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

// handle a reaction toggle for posts or replies,
// adds or removes a reaction for the current user,
// updates local reaction counts immediately,
// and stores reaction ids for quick un-react
  const handleReact = async ({ postId, replyId, reaction }) => {
    if (!userId) {
      setBanner("Sign in to react.");
      return;
    }
    const key = replyId
      ? `reply:${replyId}-${reaction}`
      : `post:${postId}-${reaction}`;
    const existingReactionId = userReactions[key];
    if (existingReactionId) {
      const { error } = await supabase
        .from("community_reactions")
        .delete()
        .eq("id", existingReactionId);
      if (error) {
        setBanner("Could not remove reaction.");
        return;
      }
      setUserReactions((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setReactionCounts((prev) => ({
        ...prev,
        [key]: Math.max((prev[key] || 1) - 1, 0)
      }));
      return;
    }
    const { data, error } = await supabase
      .from("community_reactions")
      .insert([
        {
          post_id: postId,
          reply_id: replyId || null,
          user_id: userId,
          reaction
        }
      ])
      .select("id")
      .single();
    if (error) {
      setBanner("Could not add reaction.");
      return;
    }
    setUserReactions((prev) => ({ ...prev, [key]: data?.id }));
    setReactionCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  };

// load group chat posts for the active group,
// orders newest -> oldest for chat display,
// and loads profile labels for message authors,
// called when group selection changes
  const loadGroupPosts = async (groupId) => {
    const { data } = await supabase
      .from("community_group_posts")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    setGroupPosts(data || []);
    if (data?.length) {
      loadProfiles(data.map((post) => post.created_by));
    }
  };

// render replies recursively as a nested tree,
// supports multi-level replies with indentation,
// includes reaction buttons and reply/delete actions,
// used inside each forum thread card
  const renderReplies = (replyNodes, level = 0, rootPostId = null) => {
    if (!replyNodes?.length) return null;
    return replyNodes.map((reply) => {
      const author = profiles[reply.created_by] || reply.created_by || "Anonymous";
      const replyKeyPrefix = `reply:${reply.id}`;
      return (
        <div key={reply.id} className={`community-reply-card ${level > 0 ? "nested" : ""}`}>
          <div className="community-reply-body">{reply.body}</div>
          <div className="community-thread-meta">
            {author} - {formatTime(reply.created_at)}
          </div>
          <div className="community-reaction-row">
            {reactionOptions.map((option) => {
              const key = `${replyKeyPrefix}-${option.id}`;
              const count = reactionCounts[key] || 0;
              const active = Boolean(userReactions[key]);
              return (
                <button
                  key={option.id}
                  className={`community-reaction-btn ${active ? "active" : ""}`}
                  onClick={() =>
                    handleReact({ postId: rootPostId || reply.post_id, replyId: reply.id, reaction: option.id })
                  }
                >
                  {option.label} {count}
                </button>
              );
            })}
          </div>
          <button
            className="community-reply-btn"
            onClick={() => {
              setActiveThreadId(reply.post_id);
              setNewReply({ body: "", parentId: reply.id });
              setCreateReplyOpen(true);
            }}
            type="button"
          >
            Reply
          </button>
          {Number(userId) === Number(reply.created_by) && (
            <button
              className="community-reply-btn danger"
              onClick={() => handleDeleteReply(reply.id)}
              type="button"
            >
              Delete
            </button>
          )}
          {reply.children?.length > 0 && (
            <div className="community-replies">
              {renderReplies(reply.children, level + 1, rootPostId || reply.post_id)}
            </div>
          )}
        </div>
      );
    });
  };

// derive current group and membership state,
// used to show join/leave actions in group chat,
// keeps the main render logic clean,
// recalculates when groups or memberships update
  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const isMember = activeGroupId
    ? memberships.some((membership) => membership.group_id === activeGroupId)
    : false;

// render the full Community Hub layout,
// includes header, tabs, sidebar, and main feed,
// conditionally renders forum/group/challenge views,
// and attaches modals for creation flows
  return (
    <div className="community-shell" data-user={userId || ""}>
      {/* header block with title + summary copy, */}
      {/* visually anchors the community section, */}
      {/* aligns action buttons to the right, */}
      {/* and keeps the page identity consistent */}
      <div className="community-header">
        <div>
          <div className="community-kicker">COMMUNITY</div>
          <h2 className="community-title">Train With Others</h2>
          <p className="community-sub">
            Accountability, forums, and challenges built for serious athletes.
          </p>
        </div>
        <div className="community-cta-row">
          <button className="hud-secondary-btn" onClick={() => navigate(backPath)}>
            Back
          </button>
          <button className="hud-secondary-btn" onClick={() => setCreateGroupOpen(true)}>
            Create group
          </button>
          <button className="hud-secondary-btn" onClick={() => setAddFriendOpen(true)}>
            Add friend
          </button>
        </div>
      </div>
      {/* top-level tabs to switch between forums/groups/challenges, */}
      {/* keeps the main content scoped to one view at a time, */}
      {/* updates the activeTab state on click, */}
      {/* and controls which sidebar + feed panels render */}
      <div className="community-tabs">
        <button
          className={`community-tab ${activeTab === "forums" ? "active" : ""}`}
          onClick={() => setActiveTab("forums")}
          type="button"
        >
          Forums
        </button>
        <button
          className={`community-tab ${activeTab === "groups" ? "active" : ""}`}
          onClick={() => setActiveTab("groups")}
          type="button"
        >
          Groups
        </button>
        <button
          className={`community-tab ${activeTab === "challenges" ? "active" : ""}`}
          onClick={() => setActiveTab("challenges")}
          type="button"
        >
          Challenges
        </button>
      </div>
      {banner && <div className="studio-banner info">{banner}</div>}
      {loading && <div className="community-empty">Loading community...</div>}

      {/* main layout grid that pairs sidebar + feed, */}
      {/* keeps navigation lists on the left, */}
      {/* renders the selected tab content on the right, */}
      {/* and stays consistent across all community views */}
      <div className="community-grid">
        {/* Sidebar */}
        {/* sidebar area with tab-specific navigation + actions, */}
        {/* shows forums, groups, or challenges depending on active tab, */}
        {/* includes quick actions and thread pulse summaries, */}
        {/* keeps discovery elements in a predictable column */}
        <aside className="community-sidebar">
          {activeTab === "forums" && (
            <div className="community-panel">
              <div className="community-panel-title">Forums</div>
              <input
                className="community-search"
                placeholder="Search forums"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="community-forum-actions">
                <button
                  className="hud-secondary-btn"
                  onClick={() => {
                    const defaultForum =
                      activeForum ||
                      (forums[0]?.topic_slug ?? forumTracks[0]?.id ?? "");
                    setNewPostForum(defaultForum);
                    setCreatePostOpen(true);
                  }}
                >
                  New post
                </button>
              </div>
              <div className="community-forum-list">
                {filteredForums.map((forum) => (
                  <button
                    key={forum.id}
                    className={`community-forum-item ${activeForum === (forum.topic_slug || forum.id) ? "active" : ""}`}
                    onClick={() => {
                      const slug = forum.topic_slug || forum.id;
                      setActiveForum(slug);
                      loadForumPosts(slug);
                    }}
                    type="button"
                  >
                    <div className="community-forum-title">{forum.title}</div>
                    <div className="community-forum-sub">{forum.subtitle}</div>
                  </button>
                ))}
                {!filteredForums.length && (
                  <div className="community-empty">No forums match that search.</div>
                )}
              </div>
              <div className="community-thread-pulse">
                <div className="community-panel-title">Thread Pulse</div>
                {threadPulse.map(({ post, count }) => (
                  <button
                    key={post.id}
                    className={`community-thread-row ${activeThreadId === post.id ? "active" : ""}`}
                    onClick={() => setActiveThreadId(post.id)}
                    type="button"
                  >
                    <div className="community-thread-row-main">
                      <div className="community-thread-row-title">{post.title}</div>
                      <div className="community-thread-row-sub">{count} replies</div>
                    </div>
                    {post.id === mostActiveId && (
                      <span className="community-thread-badge">Most active</span>
                    )}
                  </button>
                ))}
                {!threadPulse.length && (
                  <div className="community-empty">No threads yet.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === "groups" && (
            <div className="community-panel">
              <div className="community-panel-title">Joined Groups</div>
              <div className="community-group-list">
                {groups
                  .filter((group) => memberships.some((m) => m.group_id === group.id))
                  .map((group) => {
                    const basePath = storedMode === "gym" ? `/gym/${userId || ""}` : `/athlete/${userId || ""}`;
                    return (
                      <button
                        key={group.id}
                        className="community-forum-item community-group-joined-item"
                        onClick={() => navigate(`${basePath}/community/group/${group.id}`)}
                        type="button"
                      >
                        <div className="community-group-joined-icon">
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="community-forum-title">{group.name}</div>
                          <div className="community-forum-sub">{group.goal || "No goal set"}</div>
                        </div>
                        <span className="community-group-chevron">&rsaquo;</span>
                      </button>
                    );
                  })}
                {!groups.filter((g) => memberships.some((m) => m.group_id === g.id)).length && (
                  <div className="community-empty">You haven't joined any groups yet.</div>
                )}
              </div>
              <div className="community-forum-actions">
                <button className="hud-secondary-btn" onClick={() => setCreateGroupOpen(true)}>
                  Create group
                </button>
              </div>
            </div>
          )}

          {activeTab === "challenges" && (
            <div className="community-panel">
              <div className="community-panel-title">Challenges</div>
              <div className="community-group-list">
                {challenges.map((challenge) => (
                  <div key={challenge.id} className="community-feed-card">
                    <div className="community-feed-title">{challenge.title}</div>
                    <div className="community-feed-sub">
                      {challenge.type || "challenge"} - {challenge.duration_days || 7} days
                    </div>
                    <button className="hud-secondary-btn" onClick={() => handleJoinChallenge(challenge.id)}>
                      Join
                    </button>
                  </div>
                ))}
                {!challenges.length && <div className="community-empty">No challenges yet.</div>}
              </div>
              <div className="community-forum-actions">
                <button className="hud-secondary-btn" onClick={() => setCreateChallengeOpen(true)}>
                  Create challenge
                </button>
              </div>
            </div>
          )}

        </aside>

        {/* main feed area for the active tab content, */}
        {/* shows threads, group chat, or challenges, */}
        {/* keeps primary interactions on the right panel, */}
        {/* and pairs with the sidebar for navigation */}
        <main className="community-feed">
          {/* forum threads panel with sorting + reactions, */}
          {/* renders posts, reply trees, and thread actions, */}
          {/* supports collapse to keep long threads manageable, */}
          {/* and shows empty state when no posts exist */}
          {activeTab === "forums" && (
            <div className="community-panel">
              <div className="community-panel-title">Forum Threads</div>
              <div className="community-thread-toolbar">
                <div className="community-thread-label">Sort</div>
                <select
                  className="community-thread-select"
                  value={threadSort}
                  onChange={(event) => setThreadSort(event.target.value)}
                >
                  <option value="newest">Newest</option>
                  <option value="top">Top</option>
                  <option value="active">Most active</option>
                </select>
              </div>
              {sortedForumPosts.map((post) => {
                const replies = postReplies[post.id] || [];
                const replyTree = buildReplyTree(replies);
                const author = profiles[post.created_by] || post.created_by || "Anonymous";
                const isCollapsed = collapsedThreads[post.id];
                const isMostActive = post.id === mostActiveId;
                return (
                  <div key={post.id} className="community-feed-card">
                    <div className="community-feed-title">
                      {post.title}
                      {isMostActive && <span className="community-thread-badge">Most active</span>}
                    </div>
                    <div className="community-feed-sub">{post.body || "No details yet."}</div>
                    <div className="community-thread-meta">
                      {author} - {formatTime(post.created_at)} - {replies.length} replies
                    </div>
                    <div className="community-thread-actions">
                      <button
                        className="hud-secondary-btn"
                        onClick={() => {
                          setActiveThreadId(post.id);
                          setNewReply({ body: "", parentId: null });
                          setCreateReplyOpen(true);
                        }}
                      >
                        Reply
                      </button>
                      <button className="hud-secondary-btn" onClick={() => toggleCollapse(post.id)}>
                        {isCollapsed ? "Expand" : "Collapse"}
                      </button>
                      {Number(userId) === Number(post.created_by) && (
                        <button className="hud-secondary-btn danger" onClick={() => handleDeletePost(post.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="community-reaction-row">
                      {reactionOptions.map((option) => {
                        const key = `post:${post.id}-${option.id}`;
                        const count = reactionCounts[key] || 0;
                        const active = Boolean(userReactions[key]);
                        return (
                          <button
                            key={option.id}
                            className={`community-reaction-btn ${active ? "active" : ""}`}
                            onClick={() => handleReact({ postId: post.id, reaction: option.id })}
                          >
                            {option.label} {count}
                          </button>
                        );
                      })}
                    </div>
                    {!isCollapsed && replyTree.length > 0 && (
                      <div className="community-replies">{renderReplies(replyTree, 0, post.id)}</div>
                    )}
                    {isCollapsed && <div className="community-empty">Thread collapsed.</div>}
                  </div>
                );
              })}
              {!forumPosts.length && (
                <div className="community-empty">No posts yet. Start the first thread.</div>
              )}
            </div>
          )}

          {/* group chat panel for the selected group, */}
          {/* shows join/send actions based on membership, */}
          {/* displays the message list for the active group, */}
          {/* and includes a perks summary below */}
          {activeTab === "groups" && (
            <div className="community-panel">
              <div className="community-panel-title">Discover Groups</div>
              <div className="community-discover-grid">
                {groups
                  .filter((group) => !memberships.some((m) => m.group_id === group.id))
                  .map((group) => (
                    <div key={group.id} className="community-discover-card">
                      <div className="community-discover-card-icon">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="community-discover-card-info">
                        <div className="community-feed-title">{group.name}</div>
                        <div className="community-feed-sub">{group.goal || "No goal set"}</div>
                        <div className="community-discover-card-meta">
                          <span className="community-discover-privacy">{group.privacy || "open"}</span>
                        </div>
                      </div>
                      <button
                        className="hud-secondary-btn community-discover-join-btn"
                        onClick={() => handleJoinGroup(group.id)}
                      >
                        Join
                      </button>
                    </div>
                  ))}
                {!groups.filter((g) => !memberships.some((m) => m.group_id === g.id)).length && (
                  <div className="community-empty">No new groups to discover. Create one!</div>
                )}
              </div>
              <div className="community-panel-title" style={{ marginTop: 24 }}>
                Perks
              </div>
              <div className="community-perks-grid">
                <div className="community-perk-card">
                  <div className="community-perk-icon">&#9889;</div>
                  <div className="community-perk-label">Weekly accountability pings</div>
                </div>
                <div className="community-perk-card">
                  <div className="community-perk-icon">&#127919;</div>
                  <div className="community-perk-label">Shared goal tracking</div>
                </div>
                <div className="community-perk-card">
                  <div className="community-perk-icon">&#127942;</div>
                  <div className="community-perk-label">Group-only challenges</div>
                </div>
              </div>
            </div>
          )}

          {/* challenge list panel with join CTAs, */}
          {/* shows challenge metadata and tags, */}
          {/* encourages participation via simple buttons, */}
          {/* and displays an empty state if none exist */}
          {activeTab === "challenges" && (
            <div className="community-panel">
              <div className="community-panel-title">Weekly Challenges</div>
              {challenges.map((challenge) => (
                <div key={challenge.id} className="community-feed-card">
                  <div className="community-feed-title">{challenge.title}</div>
                  <div className="community-feed-sub">
                    {challenge.type || "challenge"} - {challenge.duration_days || 7} days - Target{" "}
                    {challenge.target_value || "--"}
                  </div>
                  <div className="community-tags">
                    <span>{challenge.type || "challenge"}</span>
                    <span>{challenge.duration_days || 7} days</span>
                  </div>
                  <button className="hud-secondary-btn" onClick={() => handleJoinChallenge(challenge.id)}>
                    Join challenge
                  </button>
                </div>
              ))}
              {!challenges.length && (
                <div className="community-empty">No challenges yet. Create the first one.</div>
              )}
            </div>
          )}

          {/* your circle summary panel for social status, */}
          {/* highlights group + friend counts at a glance, */}
          {/* provides quick CTAs to create or add, */}
          {/* and anchors the friends list below */}
          <div className="community-panel">
            <div className="community-panel-title">Your Circle</div>
            <div className="community-circle-grid">
              <div className="community-circle-card">
                <div className="community-circle-title">Accountability Groups</div>
                <div className="community-circle-sub">{memberships.length} groups joined</div>
                <button className="hud-secondary-btn" onClick={() => setCreateGroupOpen(true)}>
                  Create group
                </button>
              </div>
              <div className="community-circle-card">
                <div className="community-circle-title">
                  Friends List
                  {unreadCount > 0 && <span className="community-notification-pill">{unreadCount}</span>}
                </div>
                <div className="community-circle-sub">{friends.length} connections</div>
                <button className="hud-secondary-btn" onClick={() => setAddFriendOpen(true)}>
                  Add friends
                </button>
              </div>
              <div className="community-circle-card">
                <div className="community-circle-title">Group Chats</div>
                <div className="community-circle-sub">Make a private chat for your crew.</div>
                <button className="hud-secondary-btn">Coming soon</button>
              </div>
            </div>
            {/* friends list with status + actions, */}
            {/* shows incoming/outgoing/accepted states, */}
            {/* exposes accept/reject/message buttons, */}
            {/* and renders an empty state when none exist */}
            <div className="community-friends-list">
              {friends.map((friend) => {
                const status = getFriendStatus(friend);
                const label = buildFriendLabel(friend);
                const otherId = friend.user_id === Number(userId) ? friend.friend_user_id : friend.user_id;
                const hasUnread = getFriendUnread(friend);
                return (
                  <div key={friend.id} className="community-friend-card">
                    <div>
                      <div className="community-friend-title-row">
                        <div className="community-friend-title">{label}</div>
                        {hasUnread && <span className="community-notification-dot" />}
                      </div>
                      <div className="community-friend-sub">
                        {buildFriendMeta(friend)}
                      </div>
                      <div className="community-friend-sub">
                        {status === "accepted" ? "Connected" : status === "outgoing" ? "Request sent" : "Request received"}
                      </div>
                    </div>
                    <div className="community-friend-actions">
                      {status === "incoming" && (
                        <>
                          <button className="hud-secondary-btn" onClick={() => handleAcceptFriend(friend)}>
                            Accept
                          </button>
                          <button className="hud-secondary-btn danger" onClick={() => handleRejectFriend(friend)}>
                            Reject
                          </button>
                        </>
                      )}
                      {status === "accepted" && (
                        <button
                          className="hud-secondary-btn"
                          onClick={() => {
                            setSelectedFriendId(otherId);
                            loadFriendMessages(otherId);
                          }}
                        >
                          Message
                          {hasUnread && <span className="community-notification-dot mini" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!friends.length && (
                <div className="community-empty">No connections yet. Add a friend to start.</div>
              )}
            </div>
            {/* private chat panel for the selected friend, */}
            {/* shows message history + composer, */}
            {/* updates in realtime via subscriptions, */}
            {/* can be closed to return to the list */}
            {selectedFriendId && (
              <div className="community-friend-chat">
                <div className="community-panel-title">Private Chat</div>
                <div className="community-friend-chat-head">
                  <div className="community-friend-title">
                    {profiles[selectedFriendId] || `User ${selectedFriendId}`}
                  </div>
                  <button
                    className="hud-secondary-btn"
                    onClick={() => {
                      setSelectedFriendId(null);
                      setFriendMessages([]);
                    }}
                  >
                    Close
                  </button>
                </div>
                <div className="community-friend-chat-list">
                  {friendMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`community-friend-chat-bubble ${
                        Number(msg.user_id) === Number(userId) ? "me" : "them"
                      }`}
                    >
                      <div>{msg.body}</div>
                      <div className="community-chat-meta">{formatTime(msg.created_at)}</div>
                    </div>
                  ))}
                  {!friendMessages.length && (
                    <div className="community-empty">No messages yet. Say hello.</div>
                  )}
                </div>
                <div className="community-friend-chat-input">
                  <input
                    className="community-modal-input"
                    placeholder="Write a message"
                    value={friendMessageDraft}
                    onChange={(event) => setFriendMessageDraft(event.target.value)}
                  />
                  <button className="hud-secondary-btn" onClick={handleSendFriendMessage}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* create group modal with name/goal/privacy fields, */}
      {/* opened from quick actions or group panel, */}
      {/* writes a new group and auto-joins the user, */}
      {/* closes on cancel or successful submit */}
      {createGroupOpen && (
        <div className="community-modal-backdrop">
          <div className="community-modal">
            <div className="community-modal-title">Create accountability group</div>
            <input
              className="community-modal-input"
              placeholder="Group name"
              value={newGroup.name}
              onChange={(event) => setNewGroup((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className="community-modal-input"
              placeholder="Group goal"
              value={newGroup.goal}
              onChange={(event) => setNewGroup((prev) => ({ ...prev, goal: event.target.value }))}
            />
            <select
              className="community-modal-input"
              value={newGroup.privacy}
              onChange={(event) => setNewGroup((prev) => ({ ...prev, privacy: event.target.value }))}
            >
              <option value="invite">Invite only</option>
              <option value="request">Request to join</option>
              <option value="open">Open</option>
            </select>
            <div className="community-modal-actions">
              <button className="hud-secondary-btn" onClick={() => setCreateGroupOpen(false)}>
                Cancel
              </button>
              <button className="hud-secondary-btn" onClick={handleCreateGroup}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* create challenge modal for weekly goals, */}
      {/* collects type/target/duration inputs, */}
      {/* inserts a new challenge and refreshes the list, */}
      {/* closes on cancel or submit */}
      {createChallengeOpen && (
        <div className="community-modal-backdrop">
          <div className="community-modal">
            <div className="community-modal-title">Create challenge</div>
            <input
              className="community-modal-input"
              placeholder="Challenge title"
              value={newChallenge.title}
              onChange={(event) => setNewChallenge((prev) => ({ ...prev, title: event.target.value }))}
            />
            <select
              className="community-modal-input"
              value={newChallenge.type}
              onChange={(event) => setNewChallenge((prev) => ({ ...prev, type: event.target.value }))}
            >
              <option value="distance">Distance</option>
              <option value="time">Time</option>
              <option value="streak">Streak</option>
            </select>
            <input
              className="community-modal-input"
              placeholder="Target value"
              value={newChallenge.target}
              onChange={(event) => setNewChallenge((prev) => ({ ...prev, target: event.target.value }))}
            />
            <input
              className="community-modal-input"
              placeholder="Duration (days)"
              value={newChallenge.durationDays}
              onChange={(event) => setNewChallenge((prev) => ({ ...prev, durationDays: event.target.value }))}
            />
            <div className="community-modal-actions">
              <button className="hud-secondary-btn" onClick={() => setCreateChallengeOpen(false)}>
                Cancel
              </button>
              <button className="hud-secondary-btn" onClick={handleCreateChallenge}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* create forum post modal, */}
      {/* allows forum selection + title/body entry, */}
      {/* inserts a new post and reloads the active forum, */}
      {/* closes on cancel or successful post */}
      {createPostOpen && (
        <div className="community-modal-backdrop">
          <div className="community-modal">
            <div className="community-modal-title">Create forum post</div>
            <select
              className="community-modal-input"
              value={newPostForum}
              onChange={(event) => setNewPostForum(event.target.value)}
            >
              {forumSelectOptions.map((forum) => {
                const value = forum.topic_slug || forum.id;
                return (
                  <option key={value} value={value}>
                    {forum.title}
                  </option>
                );
              })}
            </select>
            <input
              className="community-modal-input"
              placeholder="Post title"
              value={newPost.title}
              onChange={(event) => setNewPost((prev) => ({ ...prev, title: event.target.value }))}
            />
            <textarea
              className="community-modal-textarea"
              placeholder="Post body"
              value={newPost.body}
              onChange={(event) => setNewPost((prev) => ({ ...prev, body: event.target.value }))}
            />
            <div className="community-modal-actions">
              <button className="hud-secondary-btn" onClick={() => setCreatePostOpen(false)}>
                Cancel
              </button>
              <button className="hud-secondary-btn" onClick={handleCreatePost}>
                Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* reply modal for forum threads, */}
      {/* supports replying to a post or nested reply, */}
      {/* posts the reply then refreshes the thread list, */}
      {/* closes on cancel or submit */}
      {createReplyOpen && (
        <div className="community-modal-backdrop">
          <div className="community-modal">
            <div className="community-modal-title">Reply</div>
            <textarea
              className="community-modal-textarea"
              placeholder="Write a reply"
              value={newReply.body}
              onChange={(event) => setNewReply((prev) => ({ ...prev, body: event.target.value }))}
            />
            <div className="community-modal-actions">
              <button className="hud-secondary-btn" onClick={() => setCreateReplyOpen(false)}>
                Cancel
              </button>
              <button className="hud-secondary-btn" onClick={handleCreateReply}>
                Reply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* group message modal for active group chat, */}
      {/* sends a message to the selected group, */}
      {/* reloads group chat after posting, */}
      {/* closes on cancel or send */}
      {createGroupPostOpen && (
        <div className="community-modal-backdrop">
          <div className="community-modal">
            <div className="community-modal-title">Send group message</div>
            <textarea
              className="community-modal-textarea"
              placeholder="Message"
              value={newGroupPost.body}
              onChange={(event) => setNewGroupPost((prev) => ({ ...prev, body: event.target.value }))}
            />
            <div className="community-modal-actions">
              <button className="hud-secondary-btn" onClick={() => setCreateGroupPostOpen(false)}>
                Cancel
              </button>
              <button className="hud-secondary-btn" onClick={handleCreateGroupPost}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* add friend modal using numeric user id, */}
      {/* validates the user and inserts a friend request, */}
      {/* refreshes the friends list after send, */}
      {/* closes on cancel or submit */}
      {addFriendOpen && (
        <div className="community-modal-backdrop">
          <div className="community-modal">
            <div className="community-modal-title">Add friend</div>
            <input
              className="community-modal-input"
              placeholder="Friend user id"
              value={newFriendId}
              onChange={(event) => setNewFriendId(event.target.value)}
            />
            <div className="community-modal-actions">
              <button className="hud-secondary-btn" onClick={() => setAddFriendOpen(false)}>
                Cancel
              </button>
              <button className="hud-secondary-btn" onClick={handleAddFriend}>
                Send request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}