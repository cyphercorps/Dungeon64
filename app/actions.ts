"use server"

import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

interface Character {
  name: string
  class: string
  level: number
  hp: number
  maxHp: number
  stats: {
    STR: number
    DEX: number
    CON: number
    INT: number
    WIS: number
    CHA: number
  }
  tags: string[]
  storyEvents: string[]
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
  depth: number
  roomType: string
}

interface Enemy {
  name: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  xpReward: number
  symbolic: string
}

export async function generateAIRoomDescription(room: Room, character: Character) {
  try {
    const prompt = `You are the narrator of a dark fantasy dungeon crawler. Generate atmospheric descriptions for this room:

Room Type: ${room.roomType}
Depth: ${room.depth}
Character: ${character.name} the ${character.class} (Level ${character.level})
Character Tags: ${character.tags.join(", ")}
Recent Events: ${character.storyEvents.slice(-3).join(", ")}

Generate two descriptions:
1. A practical room description (2-3 sentences)
2. A symbolic/atmospheric description that reflects the character's journey (1-2 sentences)

Format as JSON: {"description": "...", "symbolic": "..."}`

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
      temperature: 0.8,
    })

    const parsed = JSON.parse(text)
    return {
      description: parsed.description || "A chamber carved from living stone, its walls bearing the weight of ages.",
      symbolic: parsed.symbolic || "The darkness watches and remembers.",
    }
  } catch (error) {
    console.error("AI room description failed:", error)
    return {
      description: "A chamber carved from living stone, its walls bearing the weight of ages.",
      symbolic: "The darkness watches and remembers.",
    }
  }
}

export async function generateAICombatNarrative(
  action: string,
  character: Character,
  enemy: Enemy,
  result: { hit: boolean; damage: number; critical: boolean },
) {
  try {
    const prompt = `You are narrating combat in a dark fantasy dungeon crawler. Create a vivid combat description:

Action: ${action}
Character: ${character.name} the ${character.class}
Enemy: ${enemy.name}
Result: ${result.hit ? `Hit for ${result.damage} damage${result.critical ? " (CRITICAL!)" : ""}` : "Missed"}

Write a single dramatic sentence (15-25 words) describing this combat moment. Focus on visceral, atmospheric details.`

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
      temperature: 0.9,
    })

    return text.trim()
  } catch (error) {
    console.error("AI combat narrative failed:", error)
    return result.hit
      ? `${character.name}'s strike finds its mark for ${result.damage} damage!`
      : `${character.name}'s attack misses!`
  }
}

export async function generateAIEnemyEncounter(roomType: string, depth: number, character: Character): Promise<Enemy> {
  try {
    const prompt = `Generate a dungeon enemy for this encounter:

Room Type: ${roomType}
Depth: ${depth}
Character Level: ${character.level}
Character Class: ${character.class}

Create an enemy appropriate for this depth and room type. Format as JSON:
{
  "name": "Enemy Name",
  "hp": number (8-15 + depth*2),
  "maxHp": number (same as hp),
  "attack": number (2-5 + depth),
  "defense": number (0-3 + depth/2),
  "xpReward": number (15-30 + depth*10),
  "symbolic": "One atmospheric sentence about this creature"
}`

    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt,
      temperature: 0.8,
    })

    const parsed = JSON.parse(text)
    return {
      name: parsed.name || "Shadow Wraith",
      hp: parsed.hp || 8 + depth * 2,
      maxHp: parsed.maxHp || 8 + depth * 2,
      attack: parsed.attack || 3 + depth,
      defense: parsed.defense || Math.floor(depth / 2),
      xpReward: parsed.xpReward || 20 + depth * 15,
      symbolic: parsed.symbolic || "A fragment of darkness given malevolent form.",
      aiGenerated: true,
    }
  } catch (error) {
    console.error("AI enemy generation failed:", error)
    return {
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
