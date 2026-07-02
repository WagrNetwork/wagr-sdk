// Feature 10: Serialization/Deserialization - Contract data serialization

export interface SerializableData {
  toJSON(): Record<string, any>;
  toBuffer(): Buffer;
}

export interface DeserializationOptions {
  strict?: boolean;
  coerceTypes?: boolean;
}

export class DataSerializer {
  static serialize(data: any): string {
    return JSON.stringify(this.toSerializable(data));
  }

  static deserialize<T>(json: string, options: DeserializationOptions = {}): T {
    try {
      const parsed = JSON.parse(json);
      return this.fromSerializable(parsed, options) as T;
    } catch (error) {
      if (options.strict) {
        throw new Error(`Failed to deserialize: ${error}`);
      }
      return parsed as T;
    }
  }

  private static toSerializable(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    if (obj instanceof Buffer) {
      return obj.toString('hex');
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.toSerializable(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.toSerializable(obj[key]);
        }
      }
      return result;
    }

    return obj;
  }

  private static fromSerializable(obj: any, options: DeserializationOptions = {}): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string' && options.coerceTypes) {
      // Try to parse as number, boolean, or date
      if (obj === 'true') return true;
      if (obj === 'false') return false;
      if (!isNaN(Number(obj)) && obj !== '') return Number(obj);
      try {
        const date = new Date(obj);
        if (!isNaN(date.getTime())) return date;
      } catch {}
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.fromSerializable(item, options));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.fromSerializable(obj[key], options);
        }
      }
      return result;
    }

    return obj;
  }

  static encodeHex(data: any): string {
    const json = this.serialize(data);
    return Buffer.from(json).toString('hex');
  }

  static decodeHex(hex: string, options?: DeserializationOptions): any {
    const json = Buffer.from(hex, 'hex').toString('utf-8');
    return this.deserialize(json, options);
  }

  static encodeBase64(data: any): string {
    const json = this.serialize(data);
    return Buffer.from(json).toString('base64');
  }

  static decodeBase64(base64: string, options?: DeserializationOptions): any {
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return this.deserialize(json, options);
  }
}

export function createDataSerializer(): typeof DataSerializer {
  return DataSerializer;
}
