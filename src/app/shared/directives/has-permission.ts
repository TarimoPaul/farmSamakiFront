import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/services/auth';

/**
 * Shows its content only while the signed-in user holds a permission code.
 *
 * ```html
 * <section *appHasPermission="PERMISSION.MANAGE_USERS"> … </section>
 * ```
 *
 * The control-level half of the gating pair: `permissionGuard` keeps people
 * off a whole route, this keeps individual panels and buttons out of a screen
 * they are otherwise allowed on. Both read the same permission set from
 * AuthService, so a control can never disagree with the route that shows it.
 *
 * It reacts: the permission set is a signal, so a refreshed /me (a role edited
 * while the user is signed in) adds or removes the content without a reload.
 *
 * This HIDES rather than disables. A control that cannot be used and cannot be
 * explained is worse than one that was never offered - and the backend refuses
 * the call regardless, so this is presentation, never enforcement.
 */
@Directive({
  selector: '[appHasPermission]',
})
export class HasPermission {
  readonly appHasPermission = input.required<string>();

  private readonly authService = inject(AuthService);
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  private rendered = false;

  constructor() {
    effect(() => {
      const allowed = this.authService.hasPermission(this.appHasPermission());

      if (allowed && !this.rendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.viewContainer.clear();
        this.rendered = false;
      }
    });
  }
}
