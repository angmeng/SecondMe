/**
 * Style Profile Skill
 * Retrieves communication style profile learned from conversations
 */

import type {
  SkillManifest,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillHealthStatus,
} from '@secondme/shared-types';
import { AbstractSkill } from '../../base-skill.js';
import { styleProfileManifest } from './manifest.js';
import { getStyleProfileWithCache } from '../../../redis/style-cache.js';
import { getContactStyleProfile, type StyleProfile } from '../../../automem/recall.js';

/**
 * Style Profile Skill - retrieves learned communication style
 */
export class StyleProfileSkill extends AbstractSkill {
  readonly manifest: SkillManifest = styleProfileManifest;

  /**
   * Execute style profile retrieval
   */
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    this.ensureActivated();
    const startTime = Date.now();

    // Get config values
    const enabled = this.getConfig(context, 'enabled', true);
    const minSampleMessages = this.getConfig(context, 'minSampleMessages', 10);
    const cacheTTL = this.getConfig(context, 'cacheTTL', 1800);
    const includeExamples = this.getConfig(context, 'includeExamples', true);

    // Skip if disabled
    if (!enabled) {
      this.logger?.debug('Style profile skill is disabled');
      return this.buildResult(startTime, {
        data: { styleProfile: null, skipped: true },
        itemCount: 0,
      });
    }

    try {
      // Get style profile with caching
      const styleProfile = await getStyleProfileWithCache(
        context.contactId,
        () => getContactStyleProfile(context.contactId),
        cacheTTL
      );

      // Check if we have enough samples
      if (!styleProfile || styleProfile.sampleCount < minSampleMessages) {
        this.logger?.debug('Insufficient style profile samples', {
          contactId: context.contactId,
          sampleCount: styleProfile?.sampleCount ?? 0,
          required: minSampleMessages,
        });
        return this.buildResult(startTime, {
          data: { styleProfile: null, insufficientSamples: true },
          itemCount: 0,
        });
      }

      // Format context for prompt
      const contextParts: string[] = [];
      contextParts.push('**Communication Style Profile:**');

      // Message length preference
      const lengthDesc = this.describeLengthPreference(styleProfile.avgMessageLength);
      contextParts.push(`- Message length: ${lengthDesc}`);

      // Formality level
      const formalityDesc = this.describeFormalityLevel(styleProfile.formalityScore);
      contextParts.push(`- Formality: ${formalityDesc}`);

      // Emoji usage
      if (styleProfile.emojiFrequency > 0.1) {
        const emojiDesc = this.describeEmojiUsage(styleProfile.emojiFrequency);
        contextParts.push(`- Emoji usage: ${emojiDesc}`);
      }

      // Punctuation style
      const punctuationDesc = this.describePunctuationStyle(styleProfile.punctuationStyle);
      if (punctuationDesc) {
        contextParts.push(`- Punctuation: ${punctuationDesc}`);
      }

      // Greeting and sign-off examples
      if (includeExamples) {
        if (styleProfile.greetingStyle.length > 0) {
          const greetings = styleProfile.greetingStyle.slice(0, 3).join(', ');
          contextParts.push(`- Common greetings: ${greetings}`);
        }

        if (styleProfile.signOffStyle.length > 0) {
          const signOffs = styleProfile.signOffStyle.slice(0, 3).join(', ');
          contextParts.push(`- Common sign-offs: ${signOffs}`);
        }
      }

      contextParts.push(`\n(Based on ${styleProfile.sampleCount} messages)`);

      this.logger?.debug('Style profile retrieved', {
        contactId: context.contactId,
        sampleCount: styleProfile.sampleCount,
        formalityScore: styleProfile.formalityScore,
      });

      return this.buildResult(startTime, {
        context: contextParts.join('\n'),
        data: { styleProfile },
        itemCount: 1,
      });
    } catch (error) {
      this.logger?.error('Style profile retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
        contactId: context.contactId,
      });

      return this.buildResult(startTime, {
        data: { styleProfile: null, error: true },
        itemCount: 0,
      });
    }
  }

  /**
   * Describe message length preference
   */
  private describeLengthPreference(avgLength: number): string {
    if (avgLength < 50) return 'very brief (keep responses short)';
    if (avgLength < 100) return 'brief (concise responses preferred)';
    if (avgLength < 200) return 'moderate (standard length)';
    return 'detailed (longer responses acceptable)';
  }

  /**
   * Describe formality level
   */
  private describeFormalityLevel(score: number): string {
    if (score < 0.3) return 'very casual';
    if (score < 0.5) return 'casual';
    if (score < 0.7) return 'neutral';
    if (score < 0.85) return 'formal';
    return 'very formal';
  }

  /**
   * Describe emoji usage
   */
  private describeEmojiUsage(frequency: number): string {
    if (frequency < 0.2) return 'occasional';
    if (frequency < 0.5) return 'moderate';
    return 'frequent';
  }

  /**
   * Describe punctuation style
   */
  private describePunctuationStyle(style: StyleProfile['punctuationStyle']): string | null {
    const traits: string[] = [];

    if (style.usesEllipsis) {
      traits.push('uses ellipsis (...)');
    }
    if (style.exclamationFrequency > 0.3) {
      traits.push('uses exclamation marks');
    }
    if (!style.endsWithPeriod) {
      traits.push('often omits periods');
    }

    return traits.length > 0 ? traits.join(', ') : null;
  }

  /**
   * Health check
   */
  override async healthCheck(): Promise<SkillHealthStatus> {
    return this.activated ? 'healthy' : 'unhealthy';
  }
}
