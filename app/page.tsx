"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { generateAIRoomDescription, generateAICombatNarrative, generateAIEnemyEncounter } from "./actions"

// Game State Types
type GamePhase = "character-creation" | "dungeon" | "combat" | "death" | "victory"

interface Character {
  name: string
  class: string
  level: number
  hp: number
  maxHp: number
  xp: number
  xpToNext: number
  stats: {
    STR: number
    DEX: number
    CON: number
    INT: number
    WIS: number
    CHA: number
  }
  inventory: Item[]
  tags: string[]
  statusEffects: StatusEffect[]
  gold: number
  deathCount: number
  storyEvents: string[]
  personalityTraits: string[]
}

interface Item {
  name: string
  type: "weapon" | "armor" | "consumable" | "treasure" | "tool"
  effect?: string
  damage?: number
  healing?: number
  value: number
  symbolic?: string
  aiGenerated?: boolean
}

interface StatusEffect {
  name: string
  duration: number
  effect: string
}

interface Room {
  id: string
  ascii: string[]
  exits: string[]
  description: string
  symbolicText: string
  explored: boolean
  hasLoot: boolean
  hasTrap: boolean
  hasEnemy: boolean
  loot?: Item[]
  enemy?: Enemy
  depth: number
  roomType: string
  aiContext?: string
}

interface Enemy {
  name: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  xpReward: number
  loot?: Item[]
  symbolic: string
  aiGenerated?: boolean
}

interface LogEntry {
  text: string
  type: "combat" | "narrative" | "system" | "dice" | "death" | "level" | "ai"
  timestamp: number
}

interface Dungeon {
  rooms: Map<string, Room>
  currentRoomId: string
  depth: number
  maxDepth: number
  theme: string
  aiNarrator: {
    tone: string
    focus: string[]
    memoryEvents: string[]
  }
}

interface PartyMember {
  id: string
  name: string
  class: string
  level: number
  hp: number
  maxHp: number
  xp: number
  xpToNext: number
  stats: {
    STR: number
    DEX: number
    CON: number
    INT: number
    WIS: number
    CHA: number
  }
  inventory: Item[]
  tags: string[]
  statusEffects: StatusEffect[]
  personalityTraits: string[]
  isPlayer: boolean
  loyalty: number // 0-100, affects AI behavior
  relationships: { [memberId: string]: number } // -100 to 100
  combatAI: "aggressive" | "defensive" | "support" | "balanced"
  portrait: string
  joinedAt: number
  backstory: string
}

interface Party {
  members: PartyMember[]
  sharedGold: number
  sharedInventory: Item[]
  formation: string[] // member IDs in combat order
  morale: number // 0-100, affects party performance
  reputation: number // affects recruitment
}

interface CombatTurn {
  memberId: string
  action: "attack" | "defend" | "use_item" | "flee" | "wait"
  target?: string
  item?: Item
}

// Game Data
const CLASSES = [
  {
    name: "Warrior",
    bonuses: { STR: 3, CON: 2, DEX: 1 },
    startingItems: [
      { name: "Iron Sword", type: "weapon" as const, damage: 8, value: 50, effect: "A sturdy blade" },
      { name: "Leather Armor", type: "armor" as const, value: 30, effect: "+2 Defense" },
    ],
    tags: ["Battle-born", "Stalwart"],
    traits: ["Determined", "Protective", "Honor-bound"],
    description: "Masters of combat and endurance",
  },
  {
    name: "Rogue",
    bonuses: { DEX: 3, INT: 2, CHA: 1 },
    startingItems: [
      { name: "Curved Dagger", type: "weapon" as const, damage: 6, value: 40, effect: "Swift and silent" },
      { name: "Lockpicks", type: "tool" as const, value: 20, effect: "Opens locked doors" },
    ],
    tags: ["Shadow-touched", "Cunning"],
    traits: ["Cautious", "Opportunistic", "Independent"],
    description: "Swift and cunning, masters of stealth",
  },
  {
    name: "Mage",
    bonuses: { INT: 3, WIS: 2, CHA: 1 },
    startingItems: [
      { name: "Wooden Staff", type: "weapon" as const, damage: 5, value: 35, effect: "Channels arcane power" },
      { name: "Spell Scroll", type: "consumable" as const, value: 60, effect: "Casts Magic Missile" },
    ],
    tags: ["Arcane-touched", "Seeker"],
    traits: ["Curious", "Analytical", "Ambitious"],
    description: "Wielders of ancient magical forces",
  },
  {
    name: "Cleric",
    bonuses: { WIS: 3, CON: 2, STR: 1 },
    startingItems: [
      { name: "Holy Mace", type: "weapon" as const, damage: 7, value: 45, effect: "Blessed weapon" },
      { name: "Healing Potion", type: "consumable" as const, healing: 15, value: 25, effect: "Restores health" },
    ],
    tags: ["Divine-blessed", "Protector"],
    traits: ["Compassionate", "Faithful", "Resolute"],
    description: "Champions of divine power and healing",
  },
]

const BACKGROUNDS = [
  {
    name: "Tomb Raider",
    description: "You've plundered ancient sites before",
    bonuses: { gold: 50, items: ["Rope", "Torch"] },
    tags: ["Experienced", "Greedy"],
    traits: ["Cautious", "Opportunistic"],
    startingLore: "The weight of gold has always called to you louder than the whispers of the dead.",
  },
  {
    name: "Cursed Noble",
    description: "Nobility stripped away by dark magic",
    bonuses: { gold: 100, items: ["Silver Ring"] },
    tags: ["Fallen", "Proud"],
    traits: ["Arrogant", "Desperate"],
    startingLore: "Your bloodline carries both privilege and an ancient curse that drives you into darkness.",
  },
  {
    name: "Death Cultist",
    description: "Servant of dark powers seeking enlightenment",
    bonuses: { hp: 5, items: ["Ritual Dagger"] },
    tags: ["Devoted", "Twisted"],
    traits: ["Fanatical", "Fearless"],
    startingLore: "Death is not your enemy but your teacher, and these depths hold lessons yet unlearned.",
  },
  {
    name: "Lost Scholar",
    description: "Academic driven mad by forbidden knowledge",
    bonuses: { xp: 25, items: ["Ancient Tome"] },
    tags: ["Learned", "Mad"],
    traits: ["Obsessive", "Brilliant"],
    startingLore: "The texts spoke of power hidden in the deep places, and you must prove their truth.",
  },
  {
    name: "Sole Survivor",
    description: "Last of a failed expedition",
    bonuses: { hp: 10, items: ["Healing Potion", "Rope"] },
    tags: ["Haunted", "Resilient"],
    traits: ["Paranoid", "Determined"],
    startingLore: "Your companions fell to the dungeon's hunger, but you carry their memory and their mission.",
  },
]

const STAT_ARRAYS = [
  { name: "Balanced", stats: { STR: 13, DEX: 13, CON: 13, INT: 13, WIS: 13, CHA: 13 } },
  { name: "Warrior", stats: { STR: 15, DEX: 12, CON: 14, INT: 10, WIS: 11, CHA: 8 } },
  { name: "Specialist", stats: { STR: 8, DEX: 15, CON: 12, INT: 14, WIS: 13, CHA: 10 } },
  { name: "Mystic", stats: { STR: 10, DEX: 11, CON: 12, INT: 15, WIS: 14, CHA: 8 } },
]

const PORTRAITS = ["⚔️", "🗡️", "🏹", "🔮", "📿", "💀", "👑", "🌟", "🔥", "❄️", "⚡", "🌙"]

const ROOM_TEMPLATES = [
  {
    ascii: [
      "┌─────────┐",
      "│    N    │",
      "│         │",
      "│  ░░░    │",
      "│  ░@░  E │",
      "│  ░░░    │",
      "│         │",
      "│    S    │",
      "└─────────┘",
    ],
    exits: ["N", "E", "S"],
    type: "chamber",
  },
  {
    ascii: [
      "┌─────────┐",
      "│ W   N   │",
      "│         │",
      "│ ≈≈≈≈≈≈≈ │",
      "│ ≈≈≈@≈≈≈ │",
      "│ ≈≈≈≈≈≈≈ │",
      "│         │",
      "│    S    │",
      "└─────────┘",
    ],
    exits: ["N", "W", "S"],
    type: "flooded",
  },
  {
    ascii: [
      "┌─────────┐",
      "│         │",
      "│  ▲ ▲ ▲  │",
      "│ ▲▲▲▲▲▲▲ │",
      "│ ▲▲@▲▲▲▲ │",
      "│ ▲▲▲▲▲▲▲ │",
      "│  ▲ ▲ ▲  │",
      "│    S    │",
      "└─────────┘",
    ],
    exits: ["S"],
    type: "trapped",
  },
  {
    ascii: [
      "┌─────────┐",
      "│ W       │",
      "│ ████████│",
      "│ █    █ E│",
      "│ █ @  █  │",
      "│ █    █  │",
      "│ ████████│",
      "│    S    │",
      "└─────────┘",
    ],
    exits: ["W", "E", "S"],
    type: "corridor",
  },
  {
    ascii: [
      "┌─────────┐",
      "│    N    │",
      "│ ◊◊◊◊◊◊◊ │",
      "│ ◊     ◊ │",
      "│ ◊  @  ◊ │",
      "│ ◊     ◊ │",
      "│ ◊◊◊◊◊◊◊ │",
      "│    S    │",
      "└─────────┘",
    ],
    exits: ["N", "S"],
    type: "shrine",
  },
  {
    ascii: [
      "┌─────────┐",
      "│    N    │",
      "│ ╔═════╗ │",
      "│ ║     ║ │",
      "│ ║  @  ║ │",
      "│ ║     ║ │",
      "│ ╚═════╝ │",
      "│    S    │",
      "└─────────┘",
    ],
    exits: ["N", "S"],
    type: "vault",
  },
]

const LOOT_ITEMS = [
  { name: "Healing Potion", type: "consumable" as const, healing: 15, value: 25, effect: "Restores health" },
  { name: "Mana Potion", type: "consumable" as const, value: 30, effect: "Restores magical energy" },
  { name: "Ancient Coin", type: "treasure" as const, value: 50 },
  { name: "Silver Ring", type: "treasure" as const, value: 75 },
  { name: "Mystic Gem", type: "treasure" as const, value: 120 },
  { name: "Iron Key", type: "tool" as const, value: 40, effect: "Opens locked passages" },
  { name: "Torch", type: "tool" as const, value: 10, effect: "Illuminates dark places" },
  { name: "Rope", type: "tool" as const, value: 15, effect: "Useful for climbing" },
  { name: "Enchanted Dagger", type: "weapon" as const, damage: 8, value: 80, effect: "Glows with magical power" },
  { name: "Steel Sword", type: "weapon" as const, damage: 10, value: 100, effect: "A masterwork blade" },
  { name: "Ritual Dagger", type: "weapon" as const, damage: 5, value: 30, effect: "Cursed blade" },
  { name: "Ancient Tome", type: "tool" as const, value: 50, effect: "Contains forbidden knowledge" },
]

const RECRUITABLE_NPCS = [
  {
    name: "Kira Shadowbane",
    class: "Rogue",
    portrait: "🗡️",
    stats: { STR: 12, DEX: 16, CON: 13, INT: 14, WIS: 11, CHA: 10 },
    tags: ["Shadow-touched", "Cunning", "Veteran"],
    traits: ["Cautious", "Loyal", "Pragmatic"],
    combatAI: "aggressive" as const,
    backstory: "A former guild assassin seeking redemption in the depths.",
    recruitmentCost: 200,
    loyaltyRequirement: 0,
  },
  {
    name: "Brother Marcus",
    class: "Cleric",
    portrait: "📿",
    stats: { STR: 11, DEX: 9, CON: 15, INT: 12, WIS: 16, CHA: 13 },
    tags: ["Divine-blessed", "Protector", "Faithful"],
    traits: ["Compassionate", "Stubborn", "Wise"],
    combatAI: "support" as const,
    backstory: "A wandering priest drawn to cleanse this cursed place.",
    recruitmentCost: 150,
    loyaltyRequirement: 25,
  },
  {
    name: "Zara Flameheart",
    class: "Mage",
    portrait: "🔮",
    stats: { STR: 8, DEX: 12, CON: 11, INT: 17, WIS: 14, CHA: 12 },
    tags: ["Arcane-touched", "Seeker", "Ambitious"],
    traits: ["Curious", "Reckless", "Brilliant"],
    combatAI: "balanced" as const,
    backstory: "A young mage seeking forbidden knowledge in the dungeon's depths.",
    recruitmentCost: 300,
    loyaltyRequirement: 50,
  },
  {
    name: "Grimjaw the Stalwart",
    class: "Warrior",
    portrait: "⚔️",
    stats: { STR: 17, DEX: 10, CON: 16, INT: 9, WIS: 12, CHA: 8 },
    tags: ["Battle-born", "Stalwart", "Veteran"],
    traits: ["Determined", "Protective", "Gruff"],
    combatAI: "defensive" as const,
    backstory: "An old soldier who's seen too many battles, seeking one last glory.",
    recruitmentCost: 250,
    loyaltyRequirement: 30,
  },
]

export default function Dungeon64() {
  // Game State
  const [gamePhase, setGamePhase] = useState<GamePhase>("character-creation")
  const [party, setParty] = useState<Party | null>(null)
  const [activePartyMember, setActivePartyMember] = useState<string>("")
  const [dungeon, setDungeon] = useState<Dungeon | null>(null)
  const [currentEnemy, setCurrentEnemy] = useState<Enemy | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(true)
  const [combatTurnOrder, setCombatTurnOrder] = useState<string[]>([])
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0)
  const [combatActions, setCombatActions] = useState<CombatTurn[]>([])

  // Character Creation State - MOVED INSIDE COMPONENT
  const [rolledStats, setRolledStats] = useState<Character["stats"] | null>(null)
  const [selectedClass, setSelectedClass] = useState<string>("")
  const [characterName, setCharacterName] = useState("")
  const [creationStep, setCreationStep] = useState<"stats" | "class" | "background" | "name" | "preview">("stats")
  const [statMethod, setStatMethod] = useState<"roll" | "pointbuy" | "array">("roll")
  const [pointsRemaining, setPointsRemaining] = useState(27)
  const [selectedBackground, setSelectedBackground] = useState<string>("")
  const [characterPortrait, setCharacterPortrait] = useState<string>("")

  const logEndRef = useRef<HTMLDivElement>(null)

  // Utility Functions
  const rollDice = (sides = 20, count = 1) => {
    let total = 0
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1
    }
    return total
  }

  const rollStats = () => {
    return {
      STR: rollDice(6, 3) + 3,
      DEX: rollDice(6, 3) + 3,
      CON: rollDice(6, 3) + 3,
      INT: rollDice(6, 3) + 3,
      WIS: rollDice(6, 3) + 3,
      CHA: rollDice(6, 3) + 3,
    }
  }

  const addLogEntry = (text: string, type: LogEntry["type"] = "system") => {
    const newEntry: LogEntry = {
      text,
      type,
      timestamp: Date.now(),
    }
    setLog((prev) => [...prev, newEntry])
  }

  const generateRoomId = (depth: number, index: number) => {
    return `room_${depth}_${index}`
  }

  const generateRoom = async (depth: number, index: number): Promise<Room> => {
    const template = ROOM_TEMPLATES[Math.floor(Math.random() * ROOM_TEMPLATES.length)]
    const hasLoot = Math.random() < 0.3 + depth * 0.1
    const hasTrap = Math.random() < 0.2 + depth * 0.05
    const hasEnemy = Math.random() < 0.4 + depth * 0.1

    const loot: Item[] = []
    if (hasLoot) {
      const lootCount = Math.random() < 0.7 ? 1 : 2
      for (let i = 0; i < lootCount; i++) {
        const baseItem = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)]
        const item = { ...baseItem }
        loot.push(item)
      }
    }

    let enemy: Enemy | undefined
    if (hasEnemy && party) {
      try {
        const playerMember = getPlayerMember()
        if (playerMember) {
          enemy = await generateAIEnemyEncounter(template.type, depth, playerMember)
        }
      } catch (error) {
        console.error("Failed to generate enemy:", error)
        // Fallback to basic enemy
        enemy = {
          name: "Shadow Wraith",
          hp: 8 + depth * 2,
          maxHp: 8 + depth * 2,
          attack: 3 + depth,
          defense: Math.floor(depth / 2),
          xpReward: 20 + depth * 15,
          symbolic: "A fragment of darkness given malevolent form.",
        }
      }
    }

    const room: Room = {
      id: generateRoomId(depth, index),
      ascii: template.ascii,
      exits: [...template.exits],
      description: "A chamber awaiting description...",
      symbolicText: "The narrator prepares to speak...",
      explored: false,
      hasLoot,
      hasTrap,
      hasEnemy,
      loot,
      enemy,
      depth,
      roomType: template.type,
    }

    // Generate AI descriptions if character exists
    if (party && party.members.length > 0) {
      try {
        const aiDescriptions = await generateAIRoomDescription(room, party.members[0])
        room.description = aiDescriptions.description
        room.symbolicText = aiDescriptions.symbolic
      } catch (error) {
        console.error("Failed to generate room description:", error)
        room.description = "A chamber carved from living stone, its walls bearing the weight of ages."
        room.symbolicText = "The darkness watches and remembers."
      }
    }

    return room
  }

  const generateDungeon = async (): Promise<Dungeon> => {
    const rooms = new Map<string, Room>()
    const startingRoom = await generateRoom(1, 0)
    startingRoom.explored = true
    rooms.set(startingRoom.id, startingRoom)

    return {
      rooms,
      currentRoomId: startingRoom.id,
      depth: 1,
      maxDepth: 10,
      theme: "Ancient Catacombs",
      aiNarrator: {
        tone: "mythic",
        focus: ["character_growth", "symbolic_meaning"],
        memoryEvents: [],
      },
    }
  }

  const handleRollStats = () => {
    const stats = rollStats()
    setRolledStats(stats)
    addLogEntry(
      `Rolled stats: STR ${stats.STR}, DEX ${stats.DEX}, CON ${stats.CON}, INT ${stats.INT}, WIS ${stats.WIS}, CHA ${stats.CHA}`,
      "dice",
    )
  }

  const handleCreateCharacter = async () => {
    if (!rolledStats || !selectedClass || !characterName.trim() || !selectedBackground) return

    const classData = CLASSES.find((c) => c.name === selectedClass)!
    const backgroundData = BACKGROUNDS.find((b) => b.name === selectedBackground)!
    const finalStats = { ...rolledStats }

    // Apply class bonuses
    Object.entries(classData.bonuses).forEach(([stat, bonus]) => {
      finalStats[stat as keyof Character["stats"]] += bonus
    })

    const baseHp = 10 + Math.floor((finalStats.CON - 10) / 2) + (backgroundData.bonuses.hp || 0)

    const playerMember: PartyMember = {
      id: "player",
      name: characterName.trim(),
      class: selectedClass,
      level: 1,
      hp: baseHp,
      maxHp: baseHp,
      xp: backgroundData.bonuses.xp || 0,
      xpToNext: 100,
      stats: finalStats,
      inventory: [
        ...classData.startingItems.map((item) => ({ ...item })),
        ...backgroundData.bonuses.items.map((itemName) => {
          const baseItem = LOOT_ITEMS.find((item) => item.name === itemName) || {
            name: itemName,
            type: "tool" as const,
            value: 10,
            effect: "Background item",
          }
          return { ...baseItem }
        }),
      ],
      tags: [...classData.tags, ...backgroundData.tags],
      statusEffects: [],
      personalityTraits: [...classData.traits, ...backgroundData.traits],
      isPlayer: true,
      loyalty: 100,
      relationships: {},
      combatAI: "balanced",
      portrait: characterPortrait,
      joinedAt: Date.now(),
      backstory: backgroundData.startingLore,
    }

    // Add random symbolic tag
    const symbolicTags = ["Cursed", "Blessed", "Witness", "Marked", "Chosen", "Forsaken", "Haunted"]
    playerMember.tags.push(symbolicTags[Math.floor(Math.random() * symbolicTags.length)])

    const newParty: Party = {
      members: [playerMember],
      sharedGold: rollDice(6, 3) * 10 + (backgroundData.bonuses.gold || 0),
      sharedInventory: [],
      formation: ["player"],
      morale: 75,
      reputation: 0,
    }

    setParty(newParty)
    setActivePartyMember("player")

    const newDungeon = await generateDungeon()
    setDungeon(newDungeon)
    setGamePhase("dungeon")

    addLogEntry(`${playerMember.name} the ${playerMember.class} enters the dungeon...`, "narrative")
    addLogEntry(backgroundData.startingLore, "ai")
    addLogEntry("The narrator awakens, ready to weave your tale...", "ai")
  }

  const getPartyMember = (id: string): PartyMember | undefined => {
    return party?.members.find((m) => m.id === id)
  }

  const getPlayerMember = (): PartyMember | undefined => {
    return party?.members.find((m) => m.isPlayer)
  }

  const updatePartyMember = (id: string, updates: Partial<PartyMember>) => {
    setParty((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.map((member) => (member.id === id ? { ...member, ...updates } : member)),
      }
    })
  }

  const addPartyMember = (newMember: PartyMember) => {
    setParty((prev) => {
      if (!prev) return prev

      // Initialize relationships with existing members
      const relationships: { [id: string]: number } = {}
      prev.members.forEach((member) => {
        relationships[member.id] = 0 // Neutral starting relationship
        // Update existing member relationships
        updatePartyMember(member.id, {
          relationships: { ...member.relationships, [newMember.id]: 0 },
        })
      })

      const memberWithRelationships = { ...newMember, relationships }

      return {
        ...prev,
        members: [...prev.members, memberWithRelationships],
        formation: [...prev.formation, newMember.id],
      }
    })
  }

  const removePartyMember = (id: string) => {
    setParty((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        members: prev.members.filter((m) => m.id !== id),
        formation: prev.formation.filter((fId) => fId !== id),
      }
    })
  }

  const handleRecruitment = (npcData: (typeof RECRUITABLE_NPCS)[0]) => {
    if (!party || party.sharedGold < npcData.recruitmentCost) {
      addLogEntry("You lack the gold to recruit this companion.", "system")
      return
    }

    if (party.reputation < npcData.loyaltyRequirement) {
      addLogEntry(`${npcData.name} doesn't trust you enough to join your party.`, "system")
      return
    }

    if (party.members.length >= 4) {
      addLogEntry("Your party is already full.", "system")
      return
    }

    const baseHp = 10 + Math.floor((npcData.stats.CON - 10) / 2)

    const newMember: PartyMember = {
      id: `npc_${Date.now()}`,
      name: npcData.name,
      class: npcData.class,
      level: 1,
      hp: baseHp,
      maxHp: baseHp,
      xp: 0,
      xpToNext: 100,
      stats: npcData.stats,
      inventory: [],
      tags: npcData.tags,
      statusEffects: [],
      personalityTraits: npcData.traits,
      isPlayer: false,
      loyalty: 60,
      relationships: {},
      combatAI: npcData.combatAI,
      portrait: npcData.portrait,
      joinedAt: Date.now(),
      backstory: npcData.backstory,
    }

    addPartyMember(newMember)

    setParty((prev) => ({
      ...prev!,
      sharedGold: prev!.sharedGold - npcData.recruitmentCost,
      morale: Math.min(100, prev!.morale + 10),
    }))

    addLogEntry(`${npcData.name} joins your party!`, "system")
    addLogEntry(`"${npcData.backstory}"`, "ai")
  }

  // Render Functions
  const renderCharacterCreation = () => (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4">
      <Card className="bg-gray-900 border-green-400 border-2 p-3 sm:p-4 lg:p-6 w-full">
        <h2 className="text-green-400 text-lg sm:text-xl lg:text-2xl font-bold mb-4 sm:mb-6 text-center border-b border-green-400 pb-3 sm:pb-4 break-words">
          CHARACTER CREATION
        </h2>

        {/* Step Indicator */}
        <div className="flex justify-center mb-6 sm:mb-8 overflow-x-auto">
          <div className="flex space-x-2 sm:space-x-4 min-w-max">
            {["stats", "class", "background", "name", "preview"].map((step, index) => (
              <div
                key={step}
                className={`px-2 sm:px-3 py-1 rounded text-xs whitespace-nowrap ${
                  creationStep === step
                    ? "bg-green-900 text-green-400"
                    : index < ["stats", "class", "background", "name", "preview"].indexOf(creationStep)
                      ? "bg-blue-900 text-blue-400"
                      : "bg-gray-800 text-gray-400"
                }`}
              >
                {step.toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {/* Stats Step */}
        {creationStep === "stats" && (
          <div className="space-y-4 sm:space-y-6 w-full">
            <div className="text-center">
              <h3 className="text-green-400 text-lg sm:text-xl font-bold mb-3 sm:mb-4 break-words">
                CHOOSE STAT GENERATION METHOD
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-4xl mx-auto">
                <Button
                  onClick={() => setStatMethod("roll")}
                  variant={statMethod === "roll" ? "default" : "outline"}
                  className={`p-3 sm:p-4 h-auto w-full ${
                    statMethod === "roll"
                      ? "bg-green-900 text-green-400"
                      : "bg-black border-green-400 text-green-400 hover:bg-green-900"
                  }`}
                >
                  <div className="w-full">
                    <div className="font-bold text-sm sm:text-lg break-words">🎲 ROLL DICE</div>
                    <div className="text-xs mt-2 break-words">Roll 3d6+3 for each stat</div>
                  </div>
                </Button>
                <Button
                  onClick={() => setStatMethod("array")}
                  variant={statMethod === "array" ? "default" : "outline"}
                  className={`p-3 sm:p-4 h-auto w-full ${
                    statMethod === "array"
                      ? "bg-green-900 text-green-400"
                      : "bg-black border-green-400 text-green-400 hover:bg-green-900"
                  }`}
                >
                  <div className="w-full">
                    <div className="font-bold text-sm sm:text-lg break-words">📊 STANDARD ARRAY</div>
                    <div className="text-xs mt-2 break-words">Choose from a preset</div>
                  </div>
                </Button>
                <Button
                  onClick={() => {
                    setStatMethod("pointbuy")
                    setRolledStats({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 })
                    setPointsRemaining(27)
                  }}
                  variant={statMethod === "pointbuy" ? "default" : "outline"}
                  className={`p-3 sm:p-4 h-auto w-full ${
                    statMethod === "pointbuy"
                      ? "bg-green-900 text-green-400"
                      : "bg-black border-green-400 text-green-400 hover:bg-green-900"
                  }`}
                >
                  <div className="w-full">
                    <div className="font-bold text-sm sm:text-lg break-words">🎯 POINT BUY</div>
                    <div className="text-xs mt-2 break-words">Spend 27 points</div>
                  </div>
                </Button>
              </div>
            </div>

            {/* Stat Generation Interface */}
            {statMethod === "roll" && (
              <div className="text-center w-full">
                {!rolledStats ? (
                  <Button
                    onClick={handleRollStats}
                    className="bg-black border-green-400 text-green-400 hover:bg-green-900 px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg"
                  >
                    🎲 ROLL YOUR DESTINY
                  </Button>
                ) : (
                  <div className="space-y-4 w-full">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 max-w-md mx-auto">
                      {Object.entries(rolledStats).map(([stat, value]) => (
                        <div key={stat} className="bg-black border border-green-400 p-2 sm:p-3 rounded">
                          <div className="text-green-400 font-bold text-sm break-words">{stat}</div>
                          <div className="text-white text-lg sm:text-xl">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
                      <Button
                        onClick={handleRollStats}
                        variant="outline"
                        className="bg-black border-yellow-400 text-yellow-400 hover:bg-yellow-900"
                      >
                        🎲 REROLL
                      </Button>
                      <Button
                        onClick={() => setCreationStep("class")}
                        className="bg-green-900 text-green-400 hover:bg-green-800"
                      >
                        CONTINUE →
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {statMethod === "array" && (
              <div className="space-y-4 w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-4xl mx-auto">
                  {STAT_ARRAYS.map((array) => (
                    <Button
                      key={array.name}
                      onClick={() => {
                        setRolledStats(array.stats)
                        setCreationStep("class")
                      }}
                      className="p-3 sm:p-4 h-auto bg-black border-green-400 text-green-400 hover:bg-green-900 w-full"
                    >
                      <div className="w-full">
                        <div className="font-bold text-base sm:text-lg break-words">{array.name}</div>
                        <div className="text-xs mt-2 grid grid-cols-3 gap-1">
                          {Object.entries(array.stats).map(([stat, value]) => (
                            <div key={stat} className="break-words">
                              {stat}: {value}
                            </div>
                          ))}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {statMethod === "pointbuy" && rolledStats && (
              <div className="space-y-4 w-full">
                <div className="text-center">
                  <div className="text-green-400 text-base sm:text-lg break-words">
                    Points Remaining: <span className="text-white font-bold">{pointsRemaining}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
                  {Object.entries(rolledStats).map(([stat, value]) => (
                    <div key={stat} className="bg-black border border-green-400 p-2 sm:p-3 rounded">
                      <div className="text-green-400 font-bold mb-2 text-sm break-words">{stat}</div>
                      <div className="flex items-center justify-between">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (value > 8) {
                              const cost = value <= 13 ? 1 : 2
                              setRolledStats((prev) => ({ ...prev!, [stat]: value - 1 }))
                              setPointsRemaining((prev) => prev + cost)
                            }
                          }}
                          disabled={value <= 8}
                          className="w-6 h-6 sm:w-8 sm:h-8 p-0 bg-red-900 text-red-400 hover:bg-red-800 text-xs"
                        >
                          -
                        </Button>
                        <span className="text-white text-lg sm:text-xl font-bold mx-2">{value}</span>
                        <Button
                          size="sm"
                          onClick={() => {
                            const cost = value >= 13 ? 2 : 1
                            if (pointsRemaining >= cost && value < 15) {
                              setRolledStats((prev) => ({ ...prev!, [stat]: value + 1 }))
                              setPointsRemaining((prev) => prev - cost)
                            }
                          }}
                          disabled={pointsRemaining < (value >= 13 ? 2 : 1) || value >= 15}
                          className="w-6 h-6 sm:w-8 sm:h-8 p-0 bg-green-900 text-green-400 hover:bg-green-800 text-xs"
                        >
                          +
                        </Button>
                      </div>
                      <div className="text-xs text-gray-400 mt-1 break-words">Cost: {value >= 13 ? 2 : 1} pts</div>
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <Button
                    onClick={() => setCreationStep("class")}
                    disabled={pointsRemaining > 0}
                    className="bg-green-900 text-green-400 hover:bg-green-800"
                  >
                    CONTINUE →
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Class Step */}
        {creationStep === "class" && (
          <div className="space-y-4 sm:space-y-6 w-full">
            <h3 className="text-green-400 text-lg sm:text-xl font-bold text-center mb-4 sm:mb-6 break-words">
              CHOOSE YOUR CLASS
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {CLASSES.map((cls) => (
                <Button
                  key={cls.name}
                  onClick={() => setSelectedClass(cls.name)}
                  variant={selectedClass === cls.name ? "default" : "outline"}
                  className={`p-4 sm:p-6 h-auto text-left w-full ${
                    selectedClass === cls.name
                      ? "bg-green-900 text-green-400 border-green-400"
                      : "bg-black border-green-400 text-green-400 hover:bg-green-900"
                  }`}
                >
                  <div className="space-y-2 w-full">
                    <div className="font-bold text-base sm:text-lg break-words">{cls.name}</div>
                    <div className="text-sm opacity-75 break-words">{cls.description}</div>
                    <div className="text-xs">
                      <div className="mb-1 break-words">
                        Bonuses:{" "}
                        {Object.entries(cls.bonuses)
                          .map(([stat, bonus]) => `${stat} +${bonus}`)
                          .join(", ")}
                      </div>
                      <div className="mb-1 break-words">
                        Starting Items: {cls.startingItems.map((item) => item.name).join(", ")}
                      </div>
                      <div className="break-words">Tags: {cls.tags.join(", ")}</div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
            <div className="text-center flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
              <Button
                onClick={() => setCreationStep("stats")}
                variant="outline"
                className="bg-black border-gray-400 text-gray-400 hover:bg-gray-800"
              >
                ← BACK
              </Button>
              <Button
                onClick={() => setCreationStep("background")}
                disabled={!selectedClass}
                className="bg-green-900 text-green-400 hover:bg-green-800"
              >
                CONTINUE →
              </Button>
            </div>
          </div>
        )}

        {/* Background Step */}
        {creationStep === "background" && (
          <div className="space-y-4 sm:space-y-6 w-full">
            <h3 className="text-green-400 text-lg sm:text-xl font-bold text-center mb-4 sm:mb-6 break-words">
              CHOOSE YOUR BACKGROUND
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:gap-4 max-w-4xl mx-auto">
              {BACKGROUNDS.map((bg) => (
                <Button
                  key={bg.name}
                  onClick={() => setSelectedBackground(bg.name)}
                  variant={selectedBackground === bg.name ? "default" : "outline"}
                  className={`p-3 sm:p-4 h-auto text-left w-full ${
                    selectedBackground === bg.name
                      ? "bg-green-900 text-green-400 border-green-400"
                      : "bg-black border-green-400 text-green-400 hover:bg-green-900"
                  }`}
                >
                  <div className="space-y-2 w-full">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-base sm:text-lg break-words">{bg.name}</div>
                        <div className="text-sm opacity-75 break-words">{bg.description}</div>
                      </div>
                      <div className="text-xs text-right flex-shrink-0">
                        <div>+{bg.bonuses.gold || 0} Gold</div>
                        {bg.bonuses.hp && <div>+{bg.bonuses.hp} HP</div>}
                        {bg.bonuses.xp && <div>+{bg.bonuses.xp} XP</div>}
                      </div>
                    </div>
                    <div className="text-xs italic text-cyan-400 break-words whitespace-pre-wrap">
                      "{bg.startingLore}"
                    </div>
                    <div className="text-xs">
                      <div className="break-words">Items: {bg.bonuses.items.join(", ")}</div>
                      <div className="break-words">
                        Tags: {bg.tags.join(", ")} • Traits: {bg.traits.join(", ")}
                      </div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
            <div className="text-center flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
              <Button
                onClick={() => setCreationStep("class")}
                variant="outline"
                className="bg-black border-gray-400 text-gray-400 hover:bg-gray-800"
              >
                ← BACK
              </Button>
              <Button
                onClick={() => setCreationStep("name")}
                disabled={!selectedBackground}
                className="bg-green-900 text-green-400 hover:bg-green-800"
              >
                CONTINUE →
              </Button>
            </div>
          </div>
        )}

        {/* Name Step */}
        {creationStep === "name" && (
          <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto w-full">
            <h3 className="text-green-400 text-lg sm:text-xl font-bold text-center mb-4 sm:mb-6 break-words">
              NAME YOUR CHARACTER
            </h3>

            <div className="space-y-4 w-full">
              <div>
                <label className="text-green-400 font-bold mb-2 block break-words">CHARACTER NAME</label>
                <input
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="Enter your character's name..."
                  className="w-full bg-black border border-green-400 text-green-400 p-3 rounded font-mono text-base sm:text-lg"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="text-green-400 font-bold mb-2 block break-words">CHOOSE PORTRAIT</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {PORTRAITS.map((portrait) => (
                    <Button
                      key={portrait}
                      onClick={() => setCharacterPortrait(portrait)}
                      variant={characterPortrait === portrait ? "default" : "outline"}
                      className={`aspect-square text-xl sm:text-2xl ${
                        characterPortrait === portrait
                          ? "bg-green-900 text-green-400"
                          : "bg-black border-green-400 text-green-400 hover:bg-green-900"
                      }`}
                    >
                      {portrait}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-center flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
              <Button
                onClick={() => setCreationStep("background")}
                variant="outline"
                className="bg-black border-gray-400 text-gray-400 hover:bg-gray-800"
              >
                ← BACK
              </Button>
              <Button
                onClick={() => setCreationStep("preview")}
                disabled={!characterName.trim() || !characterPortrait}
                className="bg-green-900 text-green-400 hover:bg-green-800"
              >
                CONTINUE →
              </Button>
            </div>
          </div>
        )}

        {/* Preview Step */}
        {creationStep === "preview" && rolledStats && selectedClass && selectedBackground && (
          <div className="space-y-4 sm:space-y-6 w-full">
            <h3 className="text-green-400 text-lg sm:text-xl font-bold text-center mb-4 sm:mb-6 break-words">
              CHARACTER PREVIEW
            </h3>

            <div className="max-w-4xl mx-auto bg-black border border-green-400 p-4 sm:p-6 rounded w-full">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl sm:text-6xl mb-2">{characterPortrait}</div>
                    <div className="text-yellow-400 font-bold text-lg sm:text-xl break-words">{characterName}</div>
                    <div className="text-green-400 break-words">
                      {selectedClass} • {selectedBackground}
                    </div>
                  </div>

                  <div>
                    <div className="text-green-400 font-bold mb-2 break-words">FINAL STATS</div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(rolledStats).map(([stat, value]) => {
                        const classData = CLASSES.find((c) => c.name === selectedClass)!
                        const bonus = classData.bonuses[stat as keyof typeof classData.bonuses] || 0
                        const finalValue = value + bonus
                        return (
                          <div key={stat} className="bg-gray-800 p-2 rounded text-center">
                            <div className="text-green-400 text-xs break-words">{stat}</div>
                            <div className="text-white font-bold">
                              {finalValue}
                              {bonus > 0 && <span className="text-green-400 text-xs"> (+{bonus})</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-green-400 font-bold mb-2 break-words">STARTING EQUIPMENT</div>
                    <div className="text-sm space-y-1">
                      {CLASSES.find((c) => c.name === selectedClass)!.startingItems.map((item, index) => (
                        <div key={index} className="text-yellow-400 break-words">
                          • {item.name}
                        </div>
                      ))}
                      {BACKGROUNDS.find((b) => b.name === selectedBackground)!.bonuses.items.map((item, index) => (
                        <div key={index} className="text-cyan-400 break-words">
                          • {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-green-400 font-bold mb-2 break-words">TAGS & TRAITS</div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        ...CLASSES.find((c) => c.name === selectedClass)!.tags,
                        ...BACKGROUNDS.find((b) => b.name === selectedBackground)!.tags,
                      ].map((tag, index) => (
                        <span key={index} className="text-xs bg-red-900 text-red-400 px-2 py-1 rounded break-words">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        ...CLASSES.find((c) => c.name === selectedClass)!.traits,
                        ...BACKGROUNDS.find((b) => b.name === selectedBackground)!.traits,
                      ].map((trait, index) => (
                        <span key={index} className="text-xs bg-blue-900 text-blue-400 px-2 py-1 rounded break-words">
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-green-400 font-bold mb-2 break-words">STARTING LORE</div>
                    <div className="text-cyan-400 text-sm italic break-words whitespace-pre-wrap">
                      "{BACKGROUNDS.find((b) => b.name === selectedBackground)!.startingLore}"
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
              <Button
                onClick={() => setCreationStep("name")}
                variant="outline"
                className="bg-black border-gray-400 text-gray-400 hover:bg-gray-800"
              >
                ← BACK
              </Button>
              <Button
                onClick={handleCreateCharacter}
                className="bg-green-900 text-green-400 hover:bg-green-800 px-6 sm:px-8 py-2 sm:py-3 text-base sm:text-lg"
              >
                🗡️ ENTER THE DUNGEON
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )

  // Game Mechanics
  const initiateCombat = (enemy: Enemy) => {
    if (!party) return

    // Set up turn order (party members + enemy)
    const turnOrder = [...party.formation, "enemy"]
    setCombatTurnOrder(turnOrder)
    setCurrentTurnIndex(0)
    setCombatActions([])

    addLogEntry(
      `Combat begins! Turn order: ${turnOrder
        .map((id) => (id === "enemy" ? enemy.name : getPartyMember(id)?.name || "Unknown"))
        .join(" → ")}`,
      "combat",
    )
  }

  const executePartyMemberAI = async (member: PartyMember, enemy: Enemy) => {
    if (!party) return

    // Simple AI logic based on combat style
    let action: CombatTurn["action"] = "attack"
    let target = "enemy"

    switch (member.combatAI) {
      case "support":
        // Prioritize healing injured party members
        const injuredMember = party.members.find((m) => m.hp < m.maxHp * 0.5)
        if (injuredMember && member.inventory.some((item) => item.healing)) {
          action = "use_item"
          target = injuredMember.id
        }
        break

      case "defensive":
        // Defend if low health, otherwise attack
        if (member.hp < member.maxHp * 0.3) {
          action = "defend"
        }
        break

      case "aggressive":
        // Always attack
        action = "attack"
        break

      case "balanced":
        // Mix of strategies based on situation
        if (member.hp < member.maxHp * 0.2) {
          action = "defend"
        } else if (party.members.some((m) => m.hp < m.maxHp * 0.3)) {
          const healingItem = member.inventory.find((item) => item.healing)
          if (healingItem) {
            action = "use_item"
            target = party.members.find((m) => m.hp < m.maxHp * 0.3)?.id || "enemy"
          }
        }
        break
    }

    const combatAction: CombatTurn = {
      memberId: member.id,
      action,
      target,
    }

    await executeCombatAction(combatAction, enemy)
  }

  const executeCombatAction = async (combatAction: CombatTurn, enemy: Enemy) => {
    const member = getPartyMember(combatAction.memberId)
    if (!member) return

    switch (combatAction.action) {
      case "attack":
        await executeAttack(member, enemy)
        break
      case "defend":
        addLogEntry(`${member.name} takes a defensive stance.`, "combat")
        // Add temporary defense bonus
        updatePartyMember(member.id, {
          statusEffects: [
            ...member.statusEffects,
            {
              name: "Defending",
              duration: 1,
              effect: "+2 Defense",
            },
          ],
        })
        break
      case "use_item":
        if (combatAction.item) {
          await useItemInCombat(member, combatAction.item, combatAction.target)
        }
        break
      case "flee":
        addLogEntry(`${member.name} attempts to flee!`, "combat")
        break
    }
  }

  const executeAttack = async (attacker: PartyMember, enemy: Enemy) => {
    const attackRoll = rollDice() + Math.floor((attacker.stats.STR - 10) / 2)
    addLogEntry(`${attacker.name} rolled ${attackRoll} to attack.`, "dice")

    const hit = attackRoll >= 10 + enemy.defense
    let damage = 0
    let critical = false

    if (hit) {
      const weapon = attacker.inventory.find((item) => item.type === "weapon")
      const baseDamage = weapon?.damage || 4
      damage = rollDice(baseDamage) + Math.floor((attacker.stats.STR - 10) / 2)
      critical = attackRoll >= 20

      if (critical) {
        damage *= 2
        addLogEntry("Critical hit!", "combat")
      }

      // Generate AI combat narrative
      let combatNarrative = ""
      try {
        combatNarrative = await generateAICombatNarrative("player attack", attacker, enemy, {
          hit,
          damage,
          critical,
        })
        addLogEntry(combatNarrative, "ai")
      } catch (error) {
        addLogEntry(`${attacker.name}'s strike finds its mark for ${damage} damage!`, "combat")
      }

      const newEnemyHp = enemy.hp - damage
      setCurrentEnemy((prev) => ({ ...prev!, hp: Math.max(0, newEnemyHp) }))

      if (newEnemyHp <= 0) {
        addLogEntry(`The ${enemy.name} is defeated!`, "combat")
        addLogEntry("Victory belongs to your party!", "narrative")

        const xpGain = Math.floor(enemy.xpReward / party!.members.length)
        addLogEntry(`Each party member gains ${xpGain} XP!`, "system")

        // Distribute XP to all party members
        party!.members.forEach((member) => {
          updatePartyMember(member.id, {
            xp: member.xp + xpGain,
          })
          checkLevelUp(member)
        })

        // Clear enemy from room
        const currentRoom = dungeon!.rooms.get(dungeon!.currentRoomId)!
        currentRoom.hasEnemy = false
        currentRoom.enemy = undefined

        setCurrentEnemy(null)
        setGamePhase("dungeon")
        return true // Combat ended
      }
    } else {
      addLogEntry(`${attacker.name}'s attack misses!`, "combat")
    }

    return false // Combat continues
  }

  const handlePartyCombat = async () => {
    if (!currentEnemy || !party || combatTurnOrder.length === 0) return

    setIsProcessing(true)

    const currentTurnId = combatTurnOrder[currentTurnIndex]

    if (currentTurnId === "enemy") {
      // Enemy turn - attack random party member
      const aliveMember = party.members.filter((m) => m.hp > 0)
      if (aliveMember.length === 0) {
        // Party wiped
        addLogEntry("Your party has been defeated!", "death")
        setGamePhase("death")
        setIsProcessing(false)
        return
      }

      const target = aliveMember[Math.floor(Math.random() * aliveMember.length)]
      const enemyAttackRoll = rollDice() + currentEnemy.attack
      const playerDefense = 10 + Math.floor((target.stats.DEX - 10) / 2)

      if (enemyAttackRoll >= playerDefense) {
        const enemyDamage = rollDice(6) + Math.floor(currentEnemy.attack / 2)
        addLogEntry(`The ${currentEnemy.name} hits ${target.name} for ${enemyDamage} damage!`, "combat")

        const newHp = target.hp - enemyDamage
        updatePartyMember(target.id, { hp: Math.max(0, newHp) })

        if (newHp <= 0) {
          addLogEntry(`${target.name} falls unconscious!`, "combat")
          if (target.isPlayer) {
            // Player character down - check if party can continue
            const aliveMembers = party.members.filter((m) => m.hp > 0)
            if (aliveMembers.length === 0) {
              handlePartyWipe()
              setIsProcessing(false)
              return
            }
          }
        }
      } else {
        addLogEntry(`The ${currentEnemy.name} misses ${target.name}!`, "combat")
      }
    } else {
      // Party member turn
      const member = getPartyMember(currentTurnId)
      if (member && member.hp > 0) {
        if (member.isPlayer) {
          // Wait for player input
          setIsProcessing(false)
          return
        } else {
          // Execute AI turn
          const combatEnded = await executePartyMemberAI(member, currentEnemy)
          if (combatEnded) {
            setIsProcessing(false)
            return
          }
        }
      }
    }

    // Move to next turn
    const nextTurnIndex = (currentTurnIndex + 1) % combatTurnOrder.length
    setCurrentTurnIndex(nextTurnIndex)

    setIsProcessing(false)
  }

  const handlePartyWipe = () => {
    addLogEntry("Your entire party has fallen...", "death")
    addLogEntry("The dungeon claims another group of would-be heroes.", "death")
    setGamePhase("death")
  }

  const checkLevelUp = async (member: PartyMember) => {
    if (member.xp >= member.xpToNext) {
      const newLevel = member.level + 1
      const hpGain = rollDice(8) + Math.floor((member.stats.CON - 10) / 2)

      addLogEntry(`${member.name} feels power flowing through them like ancient rivers.`, "level")

      updatePartyMember(member.id, {
        level: newLevel,
        hp: member.hp + hpGain,
        maxHp: member.maxHp + hpGain,
        xp: member.xp - member.xpToNext,
        xpToNext: member.xpToNext + 50,
      })

      addLogEntry(`${member.name} is now level ${newLevel}! (+${hpGain} HP)`, "level")

      // Add new symbolic tag on level up
      const newTags = ["Ascendant", "Evolved", "Transformed", "Awakened", "Enlightened"]
      const newTag = newTags[Math.floor(Math.random() * newTags.length)]
      updatePartyMember(member.id, {
        tags: [...member.tags, newTag],
      })
    }
  }

  const handleMove = async (direction: string) => {
    if (!dungeon || !party) return

    const currentRoom = dungeon.rooms.get(dungeon.currentRoomId)!
    if (!currentRoom.exits.includes(direction)) {
      addLogEntry(`You cannot go ${direction} from here.`, "system")
      return
    }

    setIsProcessing(true)

    try {
      // Generate new room
      const newDepth =
        direction === "N" ? dungeon.depth + 1 : direction === "S" ? Math.max(1, dungeon.depth - 1) : dungeon.depth
      const newRoom = await generateRoom(newDepth, Math.floor(Math.random() * 1000))

      newRoom.explored = true
      dungeon.rooms.set(newRoom.id, newRoom)

      setDungeon((prev) => ({
        ...prev!,
        currentRoomId: newRoom.id,
        depth: newDepth,
      }))

      addLogEntry(`You move ${direction}...`, "system")
      addLogEntry(newRoom.description, "narrative")
      addLogEntry(newRoom.symbolicText, "ai")

      // Update character story
      party.members.forEach((member) => {
        updatePartyMember(member.id, {
          storyEvents: [...member.storyEvents, `Moved ${direction} to ${newRoom.roomType} at depth ${newDepth}`],
        })
      })

      if (newRoom.hasEnemy && newRoom.enemy) {
        addLogEntry(`A ${newRoom.enemy.name} blocks your party's path!`, "combat")
        addLogEntry(newRoom.enemy.symbolic, "ai")
        setCurrentEnemy({ ...newRoom.enemy })
        initiateCombat(newRoom.enemy)
        setGamePhase("combat")
      }
    } catch (error) {
      console.error("Failed to generate room:", error)
      addLogEntry("The dungeon shifts strangely around you...", "narrative")
    }

    setIsProcessing(false)
  }

  const handleSearch = async () => {
    if (!dungeon || !party) return

    const currentRoom = dungeon.rooms.get(dungeon.currentRoomId)!
    const playerMember = getPlayerMember()
    const roll = rollDice() + Math.floor((playerMember!.stats.INT - 10) / 2)
    addLogEntry(`You rolled ${roll} for Investigation.`, "dice")

    if (currentRoom.hasTrap && roll < 15) {
      const damage = rollDice(6)
      addLogEntry("You trigger a trap!", "combat")
      addLogEntry(`The trap's ancient mechanisms bite deep for ${damage} damage!`, "combat")

      updatePartyMember(playerMember!.id, {
        hp: Math.max(0, playerMember!.hp - damage),
        storyEvents: [...playerMember!.storyEvents, `Triggered trap for ${damage} damage`],
      })

      currentRoom.hasTrap = false

      if (playerMember!.hp - damage <= 0) {
        handleDeath("ancient trap")
        return
      }
    }

    if (currentRoom.hasLoot && currentRoom.loot && roll >= 12) {
      const foundLoot = currentRoom.loot.shift()!
      addLogEntry(`You discover: ${foundLoot.name}!`, "system")

      setParty((prev) => ({
        ...prev!,
        sharedInventory: [...prev!.sharedInventory, foundLoot],
      }))

      updatePartyMember(playerMember!.id, {
        storyEvents: [...playerMember!.storyEvents, `Found ${foundLoot.name}`],
      })

      if (currentRoom.loot.length === 0) {
        currentRoom.hasLoot = false
      }
    } else if (roll >= 10) {
      addLogEntry("You find nothing of interest.", "system")
    } else {
      addLogEntry("Your search reveals only shadows and dust.", "narrative")
    }
  }

  const handleCombat = async () => {
    if (!currentEnemy || !party) return

    setIsProcessing(true)

    try {
      // Player attack
      const playerMember = getPlayerMember()
      const attackRoll = rollDice() + Math.floor((playerMember!.stats.STR - 10) / 2)
      addLogEntry(`You rolled ${attackRoll} to attack.`, "dice")

      const hit = attackRoll >= 10 + currentEnemy.defense
      let damage = 0
      let critical = false

      if (hit) {
        const weapon = playerMember!.inventory.find((item) => item.type === "weapon")
        const baseDamage = weapon?.damage || 4
        damage = rollDice(baseDamage) + Math.floor((playerMember!.stats.STR - 10) / 2)
        critical = attackRoll >= 20

        if (critical) {
          damage *= 2
          addLogEntry("Critical hit!", "combat")
        }

        // Generate AI combat narrative
        try {
          const combatNarrative = await generateAICombatNarrative("player attack", playerMember!, currentEnemy, {
            hit,
            damage,
            critical,
          })
          addLogEntry(combatNarrative, "ai")
        } catch (error) {
          addLogEntry(`Your strike finds its mark for ${damage} damage!`, "combat")
        }

        const newEnemyHp = currentEnemy.hp - damage
        setCurrentEnemy((prev) => ({ ...prev!, hp: Math.max(0, newEnemyHp) }))

        if (newEnemyHp <= 0) {
          addLogEntry(`The ${currentEnemy.name} is defeated!`, "combat")
          addLogEntry("Its form dissolves into shadow and memory.", "narrative")

          const xpGain = currentEnemy.xpReward
          addLogEntry(`You gain ${xpGain} XP!`, "system")

          updatePartyMember(playerMember!.id, {
            xp: playerMember!.xp + xpGain,
            storyEvents: [...playerMember!.storyEvents, `Defeated ${currentEnemy.name}`],
          })

          checkLevelUp(playerMember!)

          // Clear enemy from room
          const currentRoom = dungeon!.rooms.get(dungeon!.currentRoomId)!
          currentRoom.hasEnemy = false
          currentRoom.enemy = undefined

          setCurrentEnemy(null)
          setGamePhase("dungeon")
          setIsProcessing(false)
          return
        }
      } else {
        addLogEntry("Your attack misses!", "combat")
      }

      // Enemy attack
      const enemyAttackRoll = rollDice() + currentEnemy.attack
      const playerDefense = 10 + Math.floor((playerMember!.stats.DEX - 10) / 2)

      if (enemyAttackRoll >= playerDefense) {
        const enemyDamage = rollDice(6) + Math.floor(currentEnemy.attack / 2)
        addLogEntry(`The ${currentEnemy.name} hits you for ${enemyDamage} damage!`, "combat")

        const newHp = playerMember!.hp - enemyDamage
        updatePartyMember(playerMember!.id, {
          hp: Math.max(0, newHp),
          storyEvents: [...playerMember!.storyEvents, `Took ${enemyDamage} damage from ${currentEnemy.name}`],
        })

        if (newHp <= 0) {
          handleDeath(currentEnemy.name)
          setIsProcessing(false)
          return
        }
      } else {
        addLogEntry(`The ${currentEnemy.name} misses!`, "combat")
      }
    } catch (error) {
      console.error("Combat error:", error)
      addLogEntry("The battle rages with primal fury!", "combat")
    }

    setIsProcessing(false)
  }

  const handleUseItem = async (item: Item) => {
    if (!party) return

    const playerMember = getPlayerMember()

    if (item.type === "consumable") {
      if (item.healing) {
        const healAmount = item.healing + rollDice(4)
        addLogEntry(`You use ${item.name} and recover ${healAmount} HP.`, "system")

        updatePartyMember(playerMember!.id, {
          hp: Math.min(playerMember!.maxHp, playerMember!.hp + healAmount),
          inventory: playerMember!.inventory.filter((i) => i !== item),
          storyEvents: [...playerMember!.storyEvents, `Used ${item.name} for ${healAmount} healing`],
        })
      } else if (item.name === "Spell Scroll") {
        if (currentEnemy) {
          const damage = rollDice(6, 3)
          addLogEntry(`You cast Magic Missile for ${damage} damage!`, "combat")
          addLogEntry("Arcane energy crackles through the air, seeking its target!", "ai")

          setCurrentEnemy((prev) => ({ ...prev!, hp: Math.max(0, prev!.hp - damage) }))

          if (currentEnemy.hp - damage <= 0) {
            addLogEntry(`The ${currentEnemy.name} is destroyed by arcane force!`, "combat")
          }
        }

        updatePartyMember(playerMember!.id, {
          inventory: playerMember!.inventory.filter((i) => i !== item),
          storyEvents: [...playerMember!.storyEvents, `Cast spell from ${item.name}`],
        })
      }
    } else {
      addLogEntry(`You cannot use ${item.name} right now.`, "system")
    }
  }

  const useItemInCombat = async (member: PartyMember, item: Item, targetId?: string) => {
    if (!party) return

    if (item.type === "consumable") {
      if (item.healing) {
        const healAmount = item.healing + rollDice(4)
        addLogEntry(`${member.name} uses ${item.name} and recovers ${healAmount} HP.`, "system")

        const targetMember = getPartyMember(targetId || member.id)

        if (targetMember) {
          updatePartyMember(targetMember.id, {
            hp: Math.min(targetMember.maxHp, targetMember.hp + healAmount),
            statusEffects: [
              ...targetMember.statusEffects,
              {
                name: "Healed",
                duration: 1,
                effect: `+${healAmount} HP`,
              },
            ],
            inventory: member.inventory.filter((i) => i !== item),
            storyEvents: [...member.storyEvents, `Used ${item.name} for ${healAmount} healing on ${targetMember.name}`],
          })
        }
      }
    }
  }

  const handleRest = async () => {
    if (!party) return

    const playerMember = getPlayerMember()

    addLogEntry("You rest in the shadows...", "narrative")

    const restRoll = rollDice() + Math.floor((playerMember!.stats.WIS - 10) / 2)

    if (restRoll >= 12) {
      const healAmount = Math.floor(playerMember!.maxHp * 0.25) + rollDice(4)
      addLogEntry(`You recover ${healAmount} HP from rest.`, "system")
      addLogEntry("Peace finds you in this cursed place, if only for a moment.", "ai")

      updatePartyMember(playerMember!.id, {
        hp: Math.min(playerMember!.maxHp, playerMember!.hp + healAmount),
        storyEvents: [...playerMember!.storyEvents, `Rested successfully for ${healAmount} HP`],
      })

      // Remove status effects
      updatePartyMember(playerMember!.id, {
        statusEffects: playerMember!.statusEffects.filter((effect) => {
          effect.duration--
          return effect.duration > 0
        }),
      })
    } else if (restRoll >= 8) {
      addLogEntry("Your rest is fitful but provides some relief.", "narrative")
      const healAmount = Math.floor(playerMember!.maxHp * 0.1)
      updatePartyMember(playerMember!.id, {
        hp: Math.min(playerMember!.maxHp, playerMember!.hp + healAmount),
        storyEvents: [...playerMember!.storyEvents, "Rested poorly"],
      })
    } else {
      addLogEntry("Your rest is disturbed by whispers in the dark.", "narrative")

      // Add negative status effect
      const curses = ["Haunted", "Weakened", "Cursed", "Tormented"]
      const curse = curses[Math.floor(Math.random() * curses.length)]

      updatePartyMember(playerMember!.id, {
        statusEffects: [
          ...playerMember!.statusEffects,
          {
            name: curse,
            duration: 3,
            effect: "The darkness clings to you",
          },
        ],
        storyEvents: [...playerMember!.storyEvents, `Became ${curse} during rest`],
      })
    }
  }

  const handleDeath = async (cause: string) => {
    if (!party) return

    const playerMember = getPlayerMember()

    addLogEntry("Your vision fades to black...", "death")
    addLogEntry("Death claims you, but the dungeon remembers.", "death")

    updatePartyMember(playerMember!.id, {
      storyEvents: [...playerMember!.storyEvents, `Died to ${cause} (Death #1)`],
    })

    setGamePhase("death")
  }

  const handleResurrection = async () => {
    if (!party) return

    const playerMember = getPlayerMember()
    const cost = playerMember!.level * 100
    if (party.sharedGold >= cost) {
      addLogEntry("Ancient magic stirs... you feel yourself pulled back.", "narrative")
      addLogEntry("Death releases its grip, but at a price.", "narrative")

      updatePartyMember(playerMember!.id, {
        hp: Math.floor(playerMember!.maxHp * 0.5),
        tags: [...playerMember!.tags, "Death-touched"],
        storyEvents: [...playerMember!.storyEvents, `Resurrected for ${cost} gold`],
      })

      setParty((prev) => ({
        ...prev!,
        sharedGold: prev!.sharedGold - cost,
      }))

      setGamePhase("dungeon")
    } else {
      addLogEntry("You lack the gold for resurrection...", "system")
      addLogEntry("Your spirit fades into the eternal dark.", "death")
    }
  }

  const handleNewCharacter = () => {
    setParty(null)
    setDungeon(null)
    setCurrentEnemy(null)
    setLog([])
    setRolledStats(null)
    setSelectedClass("")
    setCharacterName("")
    setCreationStep("stats")
    setStatMethod("roll")
    setPointsRemaining(27)
    setSelectedBackground("")
    setCharacterPortrait("")
    setActivePartyMember("")
    setCombatTurnOrder([])
    setCurrentTurnIndex(0)
    setCombatActions([])
    setGamePhase("character-creation")
  }

  // Effects
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [log])

  const renderDeathScreen = () => (
    <div className="max-w-4xl mx-auto px-4">
      <Card className="bg-gray-900 border-red-400 border-2 p-4 sm:p-6">
        <h2 className="text-red-400 text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center border-b border-red-400 pb-3 sm:pb-4 break-words">
          ☠ YOUR PARTY HAS FALLEN ☠
        </h2>

        <div className="text-center space-y-4">
          <p className="text-red-400 text-base sm:text-lg break-words">
            The dungeon has claimed another group of heroes.
          </p>

          {party && (
            <div className="space-y-2">
              <p className="text-yellow-400 break-words">FINAL PARTY ROSTER:</p>
              {party.members.map((member) => (
                <div key={member.id} className="text-gray-400 break-words">
                  {member.portrait} {member.name} the {member.class} (Level {member.level}){member.isPlayer && " 👑"}
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-red-400 pt-4 mt-6">
            <p className="text-green-400 mb-4 break-words">
              Resurrection Cost: {party ? party.members.reduce((total, member) => total + member.level * 100, 0) : 0}{" "}
              gold
            </p>
            <p className="text-green-400 mb-4 break-words">Party Gold: {party?.sharedGold || 0}</p>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
              <Button
                onClick={() => {
                  if (!party) return
                  const cost = party.members.reduce((total, member) => total + member.level * 100, 0)
                  if (party.sharedGold >= cost) {
                    addLogEntry("Ancient magic stirs... your party is pulled back from death's embrace.", "narrative")

                    // Resurrect all party members
                    party.members.forEach((member) => {
                      updatePartyMember(member.id, {
                        hp: Math.floor(member.maxHp * 0.5),
                      })
                    })

                    setParty((prev) => ({
                      ...prev!,
                      sharedGold: prev!.sharedGold - cost,
                      morale: Math.max(0, prev!.morale - 25),
                    }))

                    setGamePhase("dungeon")
                  } else {
                    addLogEntry("You lack the gold for resurrection...", "system")
                  }
                }}
                disabled={
                  !party || party.sharedGold < party.members.reduce((total, member) => total + member.level * 100, 0)
                }
                className="bg-green-900 text-green-400 hover:bg-green-800"
              >
                RESURRECT PARTY
              </Button>
              <Button onClick={handleNewCharacter} className="bg-red-900 text-red-400 hover:bg-red-800">
                NEW ADVENTURE
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )

  const getHpColor = () => {
    if (!getPlayerMember()) return "text-green-400"
    const hpPercent = getPlayerMember()!.hp / getPlayerMember()!.maxHp
    if (hpPercent > 0.6) return "text-green-400"
    if (hpPercent > 0.3) return "text-yellow-400"
    return "text-red-400"
  }

  const getCurrentRoom = () => {
    return dungeon?.rooms.get(dungeon.currentRoomId)
  }

  // Main Render
  if (gamePhase === "character-creation") {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono p-2 sm:p-4">
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-green-400 mb-2 tracking-wider break-words">
            ░▒▓ DUNGEON64 ▓▒░
          </h1>
          <p className="text-xs sm:text-sm text-green-300 opacity-75 break-words px-2">
            SYMBOLIC AI-NARRATED DUNGEON CRAWLER v2.0
          </p>
        </div>
        {renderCharacterCreation()}
      </div>
    )
  }

  if (gamePhase === "death") {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono p-2 sm:p-4">
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-red-400 mb-2 tracking-wider break-words">
            ░▒▓ DUNGEON64 ▓▒░
          </h1>
          <p className="text-xs sm:text-sm text-red-300 opacity-75 break-words px-2">
            THE NARRATOR WEEPS FOR YOUR LOSS
          </p>
        </div>
        {renderDeathScreen()}
      </div>
    )
  }

  const currentRoom = getCurrentRoom()

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-2 lg:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-4 lg:mb-6">
          <h1 className="text-2xl lg:text-4xl font-bold text-green-400 mb-2 tracking-wider break-words">
            ░▒▓ DUNGEON64 ▓▒░
          </h1>
          <p className="text-xs lg:text-sm text-green-300 opacity-75 break-words px-2">
            {gamePhase === "combat"
              ? aiAvailable
                ? "AI NARRATOR: COMBAT ENGAGED"
                : "FALLBACK NARRATOR: COMBAT ENGAGED"
              : aiAvailable
                ? "AI-POWERED SYMBOLIC DUNGEON CRAWLER v2.0"
                : "SYMBOLIC DUNGEON CRAWLER v2.0 (FALLBACK MODE)"}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[calc(100vh-200px)]">
          {/* Party Sheet - Left Panel */}
          <div className="lg:col-span-3">
            <Card className="bg-gray-900 border-green-400 border-2 h-full p-4">
              <h2 className="text-green-400 text-lg font-bold mb-4 text-center border-b border-green-400 pb-2 break-words">
                PARTY ({party?.members.length || 0}/4)
              </h2>

              {party && (
                <ScrollArea className="h-full">
                  <div className="space-y-3">
                    {/* Party Stats */}
                    <div className="border-b border-green-400 pb-2">
                      <div className="text-sm text-yellow-400 break-words">Gold: {party.sharedGold}</div>
                      <div className="text-sm text-blue-400 break-words">Morale: {party.morale}/100</div>
                      <div className="text-sm text-purple-400 break-words">Reputation: {party.reputation}</div>
                    </div>

                    {/* Party Members */}
                    {party.members.map((member) => (
                      <div
                        key={member.id}
                        className={`border rounded p-2 cursor-pointer ${
                          activePartyMember === member.id
                            ? "border-yellow-400 bg-yellow-900/20"
                            : member.hp <= 0
                              ? "border-red-400 bg-red-900/20"
                              : "border-green-400"
                        }`}
                        onClick={() => setActivePartyMember(member.id)}
                      >
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-2xl">{member.portrait}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-yellow-400 font-bold text-sm break-words">
                              {member.name} {member.isPlayer && "👑"}
                            </div>
                            <div className="text-xs text-green-300 break-words">
                              {member.class} • Level {member.level}
                            </div>
                          </div>
                        </div>

                        <div className="text-xs space-y-1">
                          <div
                            className={`break-words ${member.hp <= 0 ? "text-red-400" : member.hp < member.maxHp * 0.3 ? "text-yellow-400" : "text-green-400"}`}
                          >
                            HP: {member.hp}/{member.maxHp}
                          </div>
                          <div className="text-blue-400 break-words">
                            XP: {member.xp}/{member.xpToNext}
                          </div>
                          {!member.isPlayer && (
                            <div className="text-purple-400 break-words">Loyalty: {member.loyalty}/100</div>
                          )}
                        </div>

                        {/* Status Effects */}
                        {member.statusEffects.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {member.statusEffects.map((effect, index) => (
                              <span
                                key={index}
                                className="text-xs bg-purple-900 text-purple-400 px-1 rounded break-words"
                              >
                                {effect.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.tags.slice(0, 3).map((tag, index) => (
                            <span key={index} className="text-xs bg-red-900 text-red-400 px-1 rounded break-words">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Active Member Details */}
                    {activePartyMember &&
                      (() => {
                        const activeMember = getPartyMember(activePartyMember)
                        return activeMember ? (
                          <div className="border-t border-green-400 pt-3">
                            <div className="text-green-400 font-bold mb-2 break-words">{activeMember.name} DETAILS</div>

                            <div className="text-xs space-y-2">
                              <div>
                                <div className="text-green-300 mb-1 break-words">STATS</div>
                                <div className="grid grid-cols-3 gap-1">
                                  {Object.entries(activeMember.stats).map(([stat, value]) => (
                                    <div key={stat} className="flex justify-between">
                                      <span className="text-green-300 break-words">{stat}:</span>
                                      <span className="text-white">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="text-green-300 mb-1 break-words">
                                  INVENTORY ({activeMember.inventory.length})
                                </div>
                                <div className="max-h-20 overflow-y-auto">
                                  {activeMember.inventory.map((item, index) => (
                                    <div
                                      key={index}
                                      className="text-yellow-400 text-xs flex justify-between items-start gap-2 mb-1"
                                    >
                                      <span className="break-words flex-1 min-w-0">• {item.name}</span>
                                      {item.type === "consumable" && gamePhase === "combat" && (
                                        <Button
                                          onClick={() => {
                                            // Use item in combat
                                            const combatAction: CombatTurn = {
                                              memberId: activeMember.id,
                                              action: "use_item",
                                              item: item,
                                              target: activeMember.id,
                                            }
                                            executeCombatAction(combatAction, currentEnemy!)
                                            setCurrentTurnIndex((prev) => (prev + 1) % combatTurnOrder.length)
                                          }}
                                          size="sm"
                                          className="h-4 px-1 text-xs bg-black border-blue-400 text-blue-400 hover:bg-blue-900 flex-shrink-0"
                                        >
                                          USE
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {!activeMember.isPlayer && (
                                <div>
                                  <div className="text-green-300 mb-1 break-words">AI BEHAVIOR</div>
                                  <div className="text-cyan-400 text-xs break-words">
                                    {activeMember.combatAI.toUpperCase()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null
                      })()}

                    {/* Recruitment Section */}
                    {party.members.length < 4 && gamePhase === "dungeon" && (
                      <div className="border-t border-green-400 pt-3">
                        <div className="text-green-400 font-bold mb-2 break-words">RECRUITMENT</div>
                        <div className="space-y-2">
                          {RECRUITABLE_NPCS.filter((npc) => !party.members.some((member) => member.name === npc.name))
                            .slice(0, 2)
                            .map((npc) => (
                              <div key={npc.name} className="border border-gray-600 p-2 rounded">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="text-lg">{npc.portrait}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-yellow-400 text-xs font-bold break-words">{npc.name}</div>
                                    <div className="text-green-300 text-xs break-words">{npc.class}</div>
                                  </div>
                                </div>
                                <div className="text-xs text-gray-400 mb-2 break-words whitespace-pre-wrap">
                                  {npc.backstory}
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-yellow-400 text-xs break-words">{npc.recruitmentCost}g</span>
                                  <Button
                                    onClick={() => handleRecruitment(npc)}
                                    disabled={
                                      party.sharedGold < npc.recruitmentCost ||
                                      party.reputation < npc.loyaltyRequirement
                                    }
                                    size="sm"
                                    className="h-5 px-2 text-xs bg-green-900 text-green-400 hover:bg-green-800"
                                  >
                                    RECRUIT
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>

          {/* Main Game View - Center Panel */}
          <div className="lg:col-span-6">
            <Card className="bg-gray-900 border-green-400 border-2 h-full p-4">
              <h2 className="text-green-400 text-lg font-bold mb-4 text-center border-b border-green-400 pb-2 break-words">
                {gamePhase === "combat" ? "COMBAT" : "DUNGEON VIEW"}
              </h2>

              <div className="flex flex-col items-center space-y-4">
                {/* ASCII Room Display */}
                {currentRoom && (
                  <div className="bg-black border border-green-400 p-4 rounded w-full max-w-full overflow-x-auto">
                    <pre className="text-green-400 text-sm leading-tight whitespace-pre overflow-x-auto min-w-0">
                      {currentRoom.ascii.join("\n")}
                    </pre>
                  </div>
                )}

                {/* Combat Display */}
                {gamePhase === "combat" && currentEnemy && (
                  <div className="text-center space-y-2 border border-red-400 p-4 rounded w-full max-w-full">
                    <div className="text-red-400 font-bold text-lg break-words">
                      {currentEnemy.name} {currentEnemy.aiGenerated && "🤖"}
                    </div>
                    <div className="text-red-400 break-words">
                      HP: {currentEnemy.hp}/{currentEnemy.maxHp}
                    </div>
                    <div className="text-yellow-400 text-sm italic break-words whitespace-pre-wrap px-2">
                      {currentEnemy.symbolic}
                    </div>
                  </div>
                )}

                {/* Room Description */}
                {currentRoom && gamePhase !== "combat" && (
                  <div className="text-center space-y-2 max-w-full">
                    <p className="text-green-300 text-sm break-words whitespace-pre-wrap px-2">
                      {currentRoom.description}
                    </p>
                    <p className="text-cyan-400 text-sm italic break-words whitespace-pre-wrap px-2">
                      🤖 {currentRoom.symbolicText}
                    </p>
                  </div>
                )}

                {/* Available Exits */}
                {currentRoom && gamePhase !== "combat" && (
                  <div className="text-center">
                    <div className="text-xs text-green-300 mb-2 break-words">EXITS</div>
                    <div className="flex space-x-2 justify-center flex-wrap">
                      {currentRoom.exits.map((exit) => (
                        <span key={exit} className="text-white bg-green-900 px-2 py-1 rounded text-xs break-words">
                          [{exit}]
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Room Status Indicators */}
                {currentRoom && gamePhase !== "combat" && (
                  <div className="text-center space-y-1">
                    {currentRoom.hasLoot && (
                      <div className="text-yellow-400 text-xs break-words">✦ Treasure detected</div>
                    )}
                    {currentRoom.hasTrap && <div className="text-red-400 text-xs break-words">⚠ Danger sensed</div>}
                    {currentRoom.hasEnemy && (
                      <div className="text-red-400 text-xs break-words">👹 Hostile presence</div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Action Panel - Right Panel */}
          <div className="lg:col-span-3">
            <Card className="bg-gray-900 border-green-400 border-2 h-full p-4">
              <h2 className="text-green-400 text-lg font-bold mb-4 text-center border-b border-green-400 pb-2 break-words">
                ACTIONS
              </h2>

              <div className="space-y-3">
                {gamePhase === "combat" ? (
                  /* Party Combat Actions */
                  <div className="space-y-2">
                    {combatTurnOrder.length > 0 && (
                      <div className="text-center mb-4">
                        <div className="text-green-400 text-sm mb-2 break-words">TURN ORDER</div>
                        <div className="flex justify-center space-x-2 flex-wrap">
                          {combatTurnOrder.map((id, index) => {
                            const isCurrentTurn = index === currentTurnIndex
                            const member = id === "enemy" ? null : getPartyMember(id)
                            const name = id === "enemy" ? currentEnemy?.name : member?.name
                            return (
                              <div
                                key={id}
                                className={`px-2 py-1 rounded text-xs break-words ${
                                  isCurrentTurn
                                    ? "bg-yellow-900 text-yellow-400 border border-yellow-400"
                                    : "bg-gray-800 text-gray-400"
                                }`}
                              >
                                {name}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const currentTurnId = combatTurnOrder[currentTurnIndex]
                      const currentMember = currentTurnId === "enemy" ? null : getPartyMember(currentTurnId)

                      if (currentTurnId === "enemy" || !currentMember?.isPlayer) {
                        return (
                          <div className="text-center">
                            <div className="text-cyan-400 text-sm mb-2 break-words">
                              {currentTurnId === "enemy" ? "Enemy Turn" : `${currentMember?.name}'s Turn (AI)`}
                            </div>
                            <Button
                              onClick={handlePartyCombat}
                              disabled={isProcessing}
                              className="w-full bg-black border-cyan-400 text-cyan-400 hover:bg-cyan-900"
                            >
                              {isProcessing ? "PROCESSING..." : "CONTINUE"}
                            </Button>
                          </div>
                        )
                      }

                      // Player's turn
                      return (
                        <div className="space-y-2">
                          <div className="text-center text-green-400 text-sm mb-2 break-words">
                            {currentMember.name}'s Turn
                          </div>
                          <Button
                            onClick={async () => {
                              const combatEnded = await executeAttack(currentMember, currentEnemy!)
                              if (!combatEnded) {
                                setCurrentTurnIndex((prev) => (prev + 1) % combatTurnOrder.length)
                              }
                            }}
                            disabled={isProcessing || currentMember.hp <= 0}
                            className="w-full bg-black border-red-400 text-red-400 hover:bg-red-900"
                          >
                            {isProcessing ? "ATTACKING..." : "ATTACK"}
                          </Button>
                          <Button
                            onClick={() => {
                              const combatAction: CombatTurn = {
                                memberId: currentMember.id,
                                action: "defend",
                              }
                              executeCombatAction(combatAction, currentEnemy!)
                              setCurrentTurnIndex((prev) => (prev + 1) % combatTurnOrder.length)
                            }}
                            disabled={isProcessing || currentMember.hp <= 0}
                            className="w-full bg-black border-blue-400 text-blue-400 hover:bg-blue-900"
                          >
                            DEFEND
                          </Button>
                          <Button
                            onClick={() => {
                              addLogEntry(`${currentMember.name} attempts to flee!`, "system")
                              if (rollDice() >= 12) {
                                addLogEntry("The party escapes successfully!", "system")
                                setCurrentEnemy(null)
                                setGamePhase("dungeon")
                              } else {
                                addLogEntry("Cannot escape!", "combat")
                                setCurrentTurnIndex((prev) => (prev + 1) % combatTurnOrder.length)
                              }
                            }}
                            disabled={isProcessing}
                            className="w-full bg-black border-yellow-400 text-yellow-400 hover:bg-yellow-900"
                          >
                            FLEE
                          </Button>
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <>
                    {/* Movement Buttons */}
                    <div>
                      <div className="text-xs text-green-300 mb-2 break-words">MOVEMENT</div>
                      <div className="grid grid-cols-3 gap-1">
                        <div></div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-black border-green-400 text-green-400 hover:bg-green-900 text-xs"
                          onClick={() => handleMove("N")}
                          disabled={!currentRoom?.exits.includes("N") || isProcessing}
                        >
                          N
                        </Button>
                        <div></div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-black border-green-400 text-green-400 hover:bg-green-900 text-xs"
                          onClick={() => handleMove("W")}
                          disabled={!currentRoom?.exits.includes("W") || isProcessing}
                        >
                          W
                        </Button>
                        <div></div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-black border-green-400 text-green-400 hover:bg-green-900 text-xs"
                          onClick={() => handleMove("E")}
                          disabled={!currentRoom?.exits.includes("E") || isProcessing}
                        >
                          E
                        </Button>
                        <div></div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-black border-green-400 text-green-400 hover:bg-green-900 text-xs"
                          onClick={() => handleMove("S")}
                          disabled={!currentRoom?.exits.includes("S") || isProcessing}
                        >
                          S
                        </Button>
                        <div></div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="border-t border-green-400 pt-3">
                      <div className="text-xs text-green-300 mb-2 break-words">ACTIONS</div>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full bg-black border-yellow-400 text-yellow-400 hover:bg-yellow-900 text-xs"
                          onClick={handleSearch}
                          disabled={isProcessing}
                        >
                          {isProcessing ? "SEARCHING..." : "SEARCH"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full bg-black border-purple-400 text-purple-400 hover:bg-purple-900 text-xs"
                          onClick={handleRest}
                          disabled={isProcessing}
                        >
                          REST
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* AI Status */}
                <div className="border-t border-green-400 pt-3">
                  <div className="text-xs text-green-300 mb-2 break-words">AI NARRATOR</div>
                  <div className="text-xs space-y-1">
                    <div className={`text-xs break-words ${aiAvailable ? "text-cyan-400" : "text-yellow-400"}`}>
                      MODE: {aiAvailable ? "AI ACTIVE" : "FALLBACK"}
                    </div>
                    <div className="text-cyan-400 break-words">STATUS: {isProcessing ? "GENERATING..." : "READY"}</div>
                    <div className="text-green-400 break-words">DEPTH: {dungeon?.depth || 1}</div>
                  </div>
                </div>

                {/* System Status */}
                <div className="border-t border-green-400 pt-3">
                  <div className="text-xs text-green-300 mb-2 break-words">SYSTEM</div>
                  <div className="text-xs space-y-1">
                    <div className="text-green-400 break-words">PHASE: {gamePhase.toUpperCase()}</div>
                    <div className="text-green-400 break-words">TIME: {new Date().toLocaleTimeString()}</div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="border-t border-green-400 pt-3">
                  <Button
                    onClick={() => {
                      if (getPlayerMember()) {
                        addLogEntry(`${getPlayerMember()!.name} surrenders to the darkness...`, "death")
                        addLogEntry("Sometimes wisdom lies in knowing when to yield.", "ai")
                        handleDeath("surrender to despair")
                      }
                    }}
                    size="sm"
                    className="w-full bg-black border-red-400 text-red-400 hover:bg-red-900 text-xs"
                  >
                    SURRENDER
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Combat/Event Log - Bottom Panel */}
        <div className="mt-4">
          <Card className="bg-gray-900 border-green-400 border-2 p-4">
            <h2 className="text-green-400 text-lg font-bold mb-4 text-center border-b border-green-400 pb-2 break-words">
              EVENT LOG
            </h2>

            <ScrollArea className="h-32 lg:h-40 w-full">
              <div className="space-y-1 pr-2">
                {log.map((entry, index) => (
                  <div
                    key={index}
                    className={`text-xs break-words whitespace-pre-wrap leading-relaxed ${
                      entry.type === "combat"
                        ? "text-red-400"
                        : entry.type === "narrative"
                          ? "text-yellow-400"
                          : entry.type === "dice"
                            ? "text-blue-400"
                            : entry.type === "death"
                              ? "text-red-500 font-bold"
                              : entry.type === "level"
                                ? "text-green-500 font-bold"
                                : entry.type === "ai"
                                  ? "text-cyan-400 italic"
                                  : "text-green-400"
                    } ${index === log.length - 1 ? "font-bold" : ""}`}
                  >
                    {entry.type === "ai" ? "🤖 " : ">"} {entry.text}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  )
}
