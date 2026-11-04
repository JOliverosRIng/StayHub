import type { PropertyRepository } from '../ports/property.repository';
import type { Principal, Property } from '@accommodations/domain/properties/property.types';
import { canView } from '@accommodations/domain/properties/visibility.policy';
import { DomainError } from '@accommodations/domain/shared/domain-error';

/** Hidden and nonexistent properties are indistinguishable (NOT_FOUND). */
export class GetPropertyUseCase {
  constructor(private readonly properties: PropertyRepository) {}
  async execute(id: string, viewer: Principal | undefined): Promise<Property> {
    const property = await this.properties.findById(id);
    if (!property || !canView(property, viewer)) throw new DomainError('NOT_FOUND');
    return property;
  }
}
