const fs = require("fs");
const path = require("path");

const DEFAULT_PROFILE = {
  id: "default",
  name: "Default",
  slug: "default",
  createdAt: new Date(0).toISOString()
};

function slugify(value) {
  return `${value || "profile"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "profile";
}

class ProfileRegistry {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.registryPath = path.join(rootDir, "profiles.json");
    fs.mkdirSync(rootDir, { recursive: true });
    this.state = this.load();
  }

  load() {
    if (!fs.existsSync(this.registryPath)) {
      const initial = {
        activeProfileId: DEFAULT_PROFILE.id,
        profiles: [DEFAULT_PROFILE]
      };
      this.save(initial);
      return initial;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.registryPath, "utf8"));
      const profiles = Array.isArray(parsed.profiles) && parsed.profiles.length ? parsed.profiles : [DEFAULT_PROFILE];
      const activeProfileId = profiles.some((profile) => profile.id === parsed.activeProfileId)
        ? parsed.activeProfileId
        : profiles[0].id;
      return { activeProfileId, profiles };
    } catch {
      const fallback = {
        activeProfileId: DEFAULT_PROFILE.id,
        profiles: [DEFAULT_PROFILE]
      };
      this.save(fallback);
      return fallback;
    }
  }

  save(nextState = this.state) {
    this.state = nextState;
    fs.writeFileSync(this.registryPath, JSON.stringify(this.state, null, 2));
  }

  listProfiles() {
    return this.state.profiles.slice();
  }

  getActiveProfile() {
    return this.state.profiles.find((profile) => profile.id === this.state.activeProfileId) || this.state.profiles[0];
  }

  getProfile(profileId) {
    return this.state.profiles.find((profile) => profile.id === profileId) || null;
  }

  createProfile(name) {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let suffix = 2;
    while (this.state.profiles.some((profile) => profile.slug === slug)) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const profile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${name || "Profile"}`.trim().slice(0, 40) || "Profile",
      slug,
      createdAt: new Date().toISOString()
    };
    this.state = {
      ...this.state,
      profiles: [...this.state.profiles, profile]
    };
    this.save();
    return profile;
  }

  setActiveProfile(profileId) {
    if (!this.getProfile(profileId)) {
      throw new Error(`Unknown profile: ${profileId}`);
    }
    this.state = {
      ...this.state,
      activeProfileId: profileId
    };
    this.save();
    return this.getActiveProfile();
  }

  getProfileDataDir(profileId) {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown profile: ${profileId}`);
    }
    const dir = path.join(this.rootDir, profile.slug);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

module.exports = {
  ProfileRegistry
};
